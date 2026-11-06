import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendAdminNotification } from "../src/lib/admin-notifications.ts";

const fetchOriginal = globalThis.fetch;
const brevoKey = process.env.BREVO_API_KEY;
const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL;
const adminFrom = process.env.ADMIN_NOTIFICATION_FROM;

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (brevoKey === undefined) delete process.env.BREVO_API_KEY;
  else process.env.BREVO_API_KEY = brevoKey;
  if (adminTo === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
  else process.env.ADMIN_NOTIFICATION_EMAIL = adminTo;
  if (adminFrom === undefined) delete process.env.ADMIN_NOTIFICATION_FROM;
  else process.env.ADMIN_NOTIFICATION_FROM = adminFrom;
});

function setup() {
  process.env.BREVO_API_KEY = "test-api-key";
  process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.org";
  delete process.env.ADMIN_NOTIFICATION_FROM;
}

const basic = { subject: "[Briefings] Novo alerta", heading: "Alerta", lines: ["Mensagem de teste"] };

test("missing configuration never calls the provider", async () => {
  delete process.env.BREVO_API_KEY;
  process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.org";
  globalThis.fetch = async () => { throw new Error("Should not send"); };
  assert.deepEqual(await sendAdminNotification(basic), { sent: false, reason: "not-configured" });
});

test("sends a single Brevo email with the existing recipient, subject and reply-to", async () => {
  setup();
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["api-key"], "test-api-key");
    const body = JSON.parse(init.body);
    assert.deepEqual(body.to, [{ email: "admin@example.org" }]);
    assert.deepEqual(body.sender, { name: "Briefings", email: "noreply.briefings@gmail.com" });
    assert.equal(body.subject, basic.subject);
    assert.deepEqual(body.replyTo, { email: "reply@example.org" });
    assert.match(body.htmlContent, /&lt;script&gt;/);
    assert.doesNotMatch(body.htmlContent, /<script>/);
    assert.equal(body.textContent.includes("<script>"), true);
    assert.match(body.headers.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    return new Response(JSON.stringify({ messageId: "test" }), { status: 201 });
  };
  assert.deepEqual(await sendAdminNotification({
    ...basic, lines: ["<script>"], replyTo: "reply@example.org", idempotencyKey: "briefings-feedback-42",
  }), { sent: true });
  assert.equal(calls, 1);
});

test("retries of the same logical event carry the same deterministic key", async () => {
  setup();
  const ids = [];
  globalThis.fetch = async (_url, init) => {
    ids.push(JSON.parse(init.body).headers.idempotencyKey);
    return new Response(null, { status: 201 });
  };
  await sendAdminNotification({ ...basic, idempotencyKey: "navlog-signup-123" });
  await sendAdminNotification({ ...basic, idempotencyKey: "navlog-signup-123" });
  await sendAdminNotification({ ...basic, idempotencyKey: "navlog-signup-456" });
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
});

test("Brevo duplicate_parameter is treated as already accepted", async () => {
  setup();
  globalThis.fetch = async () => new Response(JSON.stringify({ code: "duplicate_parameter" }), { status: 400 });
  assert.deepEqual(await sendAdminNotification({ ...basic, idempotencyKey: "feedback-7" }), { sent: true });
});

test("provider errors return failed instead of claiming delivery", async () => {
  setup();
  const oldError = console.error;
  console.error = () => {};
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ code: "bad_request" }), { status: 400 });
    assert.deepEqual(await sendAdminNotification(basic), { sent: false, reason: "failed" });
    globalThis.fetch = async () => { throw new Error("Network down"); };
    assert.deepEqual(await sendAdminNotification(basic), { sent: false, reason: "failed" });
  } finally {
    console.error = oldError;
  }
});

test("invalid reply-to is omitted instead of invalidating the message", async () => {
  setup();
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(Object.hasOwn(body, "replyTo"), false);
    return new Response(null, { status: 201 });
  };
  assert.deepEqual(await sendAdminNotification({ ...basic, replyTo: "not-an-email" }), { sent: true });
});
