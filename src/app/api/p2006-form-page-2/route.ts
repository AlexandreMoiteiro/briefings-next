import { P2006T_FORM_PAGE_2_WEBP_BASE64 } from "@/lib/pdf/p2006t-form-page-2";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const image = Buffer.from(P2006T_FORM_PAGE_2_WEBP_BASE64, "base64");
  const validWebP =
    image.length > 12 &&
    image.subarray(0, 4).toString("ascii") === "RIFF" &&
    image.subarray(8, 12).toString("ascii") === "WEBP";

  if (!validWebP) {
    return Response.json({ error: "Form page 2 image is invalid." }, { status: 500 });
  }

  return new Response(image, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
