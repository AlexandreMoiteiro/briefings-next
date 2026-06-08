"use client";

import { logUsageEvent } from "@/lib/usage-events";
import { useMemo, useState } from "react";
import { buildBriefingPdf } from "@/lib/pdf/briefing-pdf";
import {
  aircraftRegistrations,
  briefingSteps,
  getUploadTarget,
  missionDefaults,
  uploadTargets,
  type BriefingStepId,
  type MissionForm,
  type UploadBucketId,
  type UploadSectionId,
  type UploadTarget,
} from "@/lib/briefing";

type BriefingFile = {
  id: string;
  sectionId: UploadSectionId;
  bucketId: UploadBucketId;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  previewUrl: string;
  file: File;
};

type RouteFile = {
  name: string;
  size: number;
  type: string;
  previewUrl: string;
  file: File;
};

type RoutePair = {
  id: string;
  name: string;
  navlog: RouteFile | null;
  vfrMap: RouteFile | null;
};

const acceptedFiles = ".pdf,.png,.jpg,.jpeg,.gif";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, index);

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function fileToBriefingFile(file: File, target: UploadTarget): BriefingFile {
  return {
    id: crypto.randomUUID(),
    sectionId: target.sectionId,
    bucketId: target.bucketId,
    name: file.name,
    size: file.size,
    type: file.type || "Unknown",
    lastModified: file.lastModified,
    previewUrl: URL.createObjectURL(file),
    file,
  };
}

function fileToRouteFile(file: File): RouteFile {
  return {
    name: file.name,
    size: file.size,
    type: file.type || "Unknown",
    previewUrl: URL.createObjectURL(file),
    file,
  };
}

function downloadPdf(bytes: Uint8Array, filename: string) {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function buildBriefingFilename(registration: string, flightDate: string) {
  const safeRegistration = registration || "Aircraft";
  const safeDate = flightDate || new Date().toISOString().slice(0, 10);

  return `Briefing_${safeRegistration}_${safeDate}.pdf`;
}

function isPdf(file: { name: string; type: string }) {
  return file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
}

function isImage(file: { name: string; type: string }) {
  return (
    file.type.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".gif"].some((extension) =>
      file.name.toLowerCase().endsWith(extension)
    )
  );
}

function PreviewFrame({ file }: { file: BriefingFile | RouteFile }) {
  if (isImage(file)) {
    return (
      <img
        src={file.previewUrl}
        alt={file.name}
        className="h-64 w-full rounded-xl border border-zinc-200 object-contain"
      />
    );
  }

  if (isPdf(file)) {
    return (
      <iframe
        src={file.previewUrl}
        title={file.name}
        className="h-80 w-full rounded-xl border border-zinc-200 bg-white"
      />
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
      Preview is not available for this file type.
    </div>
  );
}

export function BriefingBuilderClient() {
  const [activeStepId, setActiveStepId] = useState<BriefingStepId>("mission");
  const [mission, setMission] = useState<MissionForm>(missionDefaults);
  const [files, setFiles] = useState<BriefingFile[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RoutePair[]>([
    {
      id: crypto.randomUUID(),
      name: "Route 1",
      navlog: null,
      vfrMap: null,
    },
  ]);

  const activeStepIndex = briefingSteps.findIndex(
    (step) => step.id === activeStepId
  );

  const activeStep =
    briefingSteps.find((step) => step.id === activeStepId) ?? briefingSteps[0];

  const progressPercent =
    ((activeStepIndex + 1) / briefingSteps.length) * 100;

  const previousStep = briefingSteps[activeStepIndex - 1] ?? null;
  const nextStep = briefingSteps[activeStepIndex + 1] ?? null;

  function goToPreviousStep() {
    if (previousStep) {
      setActiveStepId(previousStep.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goToNextStep() {
    if (nextStep) {
      setActiveStepId(nextStep.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goToGenerateStep() {
    setActiveStepId("generate");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const visibleTargets = uploadTargets.filter((target) => {
    if (activeStepId === "weather") return target.sectionId === "weather";
    if (activeStepId === "notam") return target.sectionId === "notam";
    if (activeStepId === "performance") return target.sectionId === "performance";
    if (activeStepId === "fpl") return target.sectionId === "fpl";
    return false;
  });

  const filesByBucket = useMemo(() => {
    return uploadTargets.reduce<Record<UploadBucketId, BriefingFile[]>>(
      (acc, target) => {
        acc[target.bucketId] = files.filter(
          (file) => file.bucketId === target.bucketId
        );
        return acc;
      },
      {
        pressure: [],
        sigwx: [],
        wind: [],
        weather_other: [],
        pib: [],
        sup: [],
        performance: [],
        fpl: [],
        attachments: [],
      }
    );
  }, [files]);

  const completedSteps = useMemo(() => {
    let count = 0;

    if (
      mission.pilot ||
      mission.callsign ||
      mission.registration ||
      mission.missionNumber ||
      mission.flightDate ||
      mission.timeUtc
    ) {
      count += 1;
    }

    if (files.some((file) => file.sectionId === "weather")) count += 1;
    if (files.some((file) => file.sectionId === "notam")) count += 1;
    if (files.some((file) => file.sectionId === "performance")) count += 1;
    if (files.some((file) => file.sectionId === "fpl")) count += 1;
    if (routes.some((route) => route.navlog || route.vfrMap)) count += 1;

    return count;
  }, [files, mission, routes]);

  function addFiles(target: UploadTarget, selectedFiles: FileList | null) {
    if (!selectedFiles) return;

    const nextFiles = Array.from(selectedFiles).map((file) =>
      fileToBriefingFile(file, target)
    );

    setFiles((current) => [...current, ...nextFiles]);
  }

  function removeFile(fileId: string) {
    setFiles((current) => {
      const file = current.find((item) => item.id === fileId);
      if (file) URL.revokeObjectURL(file.previewUrl);
      return current.filter((item) => item.id !== fileId);
    });
  }

  function moveFileOrder(fileId: string, direction: "up" | "down") {
    setFiles((current) => {
      const file = current.find((item) => item.id === fileId);
      if (!file) return current;

      const sameBucket = current.filter((item) => item.bucketId === file.bucketId);
      const bucketIndex = sameBucket.findIndex((item) => item.id === fileId);
      const swapWith =
        direction === "up" ? sameBucket[bucketIndex - 1] : sameBucket[bucketIndex + 1];

      if (!swapWith) return current;

      const fileIndex = current.findIndex((item) => item.id === file.id);
      const swapIndex = current.findIndex((item) => item.id === swapWith.id);

      const next = [...current];
      next[fileIndex] = swapWith;
      next[swapIndex] = file;

      return next;
    });
  }

  function moveFileToBucket(fileId: string, bucketId: UploadBucketId) {
    const target = uploadTargets.find((item) => item.bucketId === bucketId);
    if (!target) return;

    setFiles((current) =>
      current.map((file) =>
        file.id === fileId
          ? {
              ...file,
              sectionId: target.sectionId,
              bucketId: target.bucketId,
            }
          : file
      )
    );
  }

  function clearBucket(bucketId: UploadBucketId) {
    setFiles((current) => {
      current
        .filter((file) => file.bucketId === bucketId)
        .forEach((file) => URL.revokeObjectURL(file.previewUrl));

      return current.filter((file) => file.bucketId !== bucketId);
    });
  }

  function getAircraftTypeFromRegistration(
    registration: string,
    fallbackAircraftType: string
  ) {
    if (registration.startsWith("CS-")) return "P2008";
    if (registration.startsWith("OE-")) return "PA28";
    return fallbackAircraftType;
  }

  function updateMissionField(field: keyof MissionForm, value: string) {
    setMission((current) => {
      if (field === "registration") {
        return {
          ...current,
          registration: value,
          aircraftType: getAircraftTypeFromRegistration(
            value,
            current.aircraftType
          ),
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  }

  function addRoute() {
    setRoutes((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: `Route ${current.length + 1}`,
        navlog: null,
        vfrMap: null,
      },
    ]);
  }

  function removeRoute(routeId: string) {
    setRoutes((current) => {
      const route = current.find((item) => item.id === routeId);

      if (route?.navlog) URL.revokeObjectURL(route.navlog.previewUrl);
      if (route?.vfrMap) URL.revokeObjectURL(route.vfrMap.previewUrl);

      return current.filter((item) => item.id !== routeId);
    });
  }

  function moveRoute(routeId: string, direction: "up" | "down") {
    setRoutes((current) => {
      const index = current.findIndex((route) => route.id === routeId);
      const nextIndex = direction === "up" ? index - 1 : index + 1;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const currentRoute = next[index];
      const swapRoute = next[nextIndex];

      next[index] = swapRoute;
      next[nextIndex] = currentRoute;

      return next;
    });
  }

  function clearRouteFile(routeId: string, slot: "navlog" | "vfrMap") {
    setRoutes((current) =>
      current.map((route) => {
        if (route.id !== routeId) return route;

        const existingFile = route[slot];

        if (existingFile) {
          URL.revokeObjectURL(existingFile.previewUrl);
        }

        return {
          ...route,
          [slot]: null,
        };
      })
    );
  }

  function updateRouteName(routeId: string, name: string) {
    setRoutes((current) =>
      current.map((route) =>
        route.id === routeId
          ? {
              ...route,
              name,
            }
          : route
      )
    );
  }

  function setRouteFile(
    routeId: string,
    slot: "navlog" | "vfrMap",
    selectedFiles: FileList | null
  ) {
    const file = selectedFiles?.[0];
    if (!file) return;

    setRoutes((current) =>
      current.map((route) =>
        route.id === routeId
          ? {
              ...route,
              [slot]: fileToRouteFile(file),
            }
          : route
      )
    );
  }

  async function handleGeneratePdf() {
    setPdfError(null);
    setIsGeneratingPdf(true);

    try {
      const bytes = await buildBriefingPdf({
        mission,
        files,
        routes,
      });

      downloadPdf(
        bytes,
        buildBriefingFilename(mission.registration, mission.flightDate)
      );

      void logUsageEvent({
        eventType: "briefing_export",
        module: "briefing",
        title: `Briefing ${mission.registration || "unknown registration"}`,
        aircraftType: mission.aircraftType,
        registration: mission.registration,
        summary: {
          aircraftType: mission.aircraftType,
          registration: mission.registration,
          callsign: mission.callsign,
          flightDate: mission.flightDate,
          missionNumber: mission.missionNumber,
          fileCount: Object.values(files).filter(Boolean).length,
          routePairs: routes.filter((route) => route.navlog || route.vfrMap)
            .length,
        },
        payload: {
          mission,
          files: Object.fromEntries(
            Object.entries(files).map(([key, item]) => [
              key,
              item
                ? {
                    name: item.name,
                    type: item.type,
                    size: item.size,
                  }
                : null,
            ])
          ),
          routes: routes.map((route) => ({
            name: route.name,
            navlog: route.navlog
              ? {
                  name: route.navlog.name,
                  type: route.navlog.type,
                  size: route.navlog.size,
                }
              : null,
            vfrMap: route.vfrMap
              ? {
                  name: route.vfrMap.name,
                  type: route.vfrMap.type,
                  size: route.vfrMap.size,
                }
              : null,
          })),
        },
      });
    } catch (error) {
      console.error(error);
      setPdfError(
        "Could not generate the PDF. Check that every file is a valid PDF, PNG, JPG, JPEG or GIF."
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  }


  return (
    <div className="space-y-8">
      <section className="border-b border-zinc-200 pb-8">
        <p className="mb-3 text-sm font-medium text-zinc-500">Final PDF</p>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              Briefing Builder
            </h1>

            <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
              Build a structured briefing package: mission details, weather charts, NOTAM documents, performance/M&B, FPL and route file pairs with previews and ordering.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
            <div className="text-sm text-zinc-500">Completed content</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
              {completedSteps}/6
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              {files.length} ficheiro{files.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>
              Step {activeStepIndex + 1} of {briefingSteps.length}
            </span>
            <span>{activeStep.title}</span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-zinc-950 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="px-3 py-2">
            <h2 className="text-sm font-semibold text-zinc-950">
              Briefing steps
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Keep the logical order that will be used in the final PDF.
            </p>
          </div>

          <div className="mt-2 space-y-1">
            {briefingSteps.map((step, index) => {
              const isActive = activeStepId === step.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStepId(step.id)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                    isActive
                      ? "bg-zinc-950 text-white"
                      : "text-zinc-700 hover:bg-zinc-100",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      isActive
                        ? "bg-white text-zinc-950"
                        : "bg-zinc-100 text-zinc-500",
                    ].join(" ")}
                  >
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {step.shortTitle}
                    </span>
                    <span
                      className={[
                        "block text-xs",
                        isActive ? "text-zinc-300" : "text-zinc-400",
                      ].join(" ")}
                    >
                      {step.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-500">
              {activeStep.shortTitle}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
              {activeStep.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              {activeStep.description}
            </p>
          </section>

          {activeStepId === "mission" ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
                Mission details
              </h3>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">
                    Pilot
                  </span>
                  <input
                    value={mission.pilot}
                    onChange={(event) =>
                      updateMissionField("pilot", event.target.value)
                    }
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">
                    Callsign
                  </span>
                  <input
                    value={mission.callsign}
                    onChange={(event) =>
                      updateMissionField("callsign", event.target.value)
                    }
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">
                    Aircraft type
                  </span>
                  <select
                    value={mission.aircraftType}
                    onChange={(event) =>
                      updateMissionField("aircraftType", event.target.value)
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  >
                    <option value="PA28">PA-28</option>
                    <option value="P2008">Tecnam P2008</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">
                    Registration
                  </span>
                  <select
                    value={mission.registration}
                    onChange={(event) =>
                      updateMissionField("registration", event.target.value)
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  >
                    <optgroup label="Piper PA-28">
                      {aircraftRegistrations
                        .filter((registration) => registration.startsWith("OE-"))
                        .map((registration) => (
                          <option key={registration} value={registration}>
                            {registration}
                          </option>
                        ))}
                    </optgroup>

                    <optgroup label="Tecnam P2008">
                      {aircraftRegistrations
                        .filter((registration) => registration.startsWith("CS-"))
                        .map((registration) => (
                          <option key={registration} value={registration}>
                            {registration}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">
                    Mission number
                  </span>
                  <input
                    value={mission.missionNumber}
                    onChange={(event) =>
                      updateMissionField("missionNumber", event.target.value)
                    }
                    placeholder="Ex: Mission 12"
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">
                    Flight date
                  </span>
                  <input
                    type="date"
                    value={mission.flightDate}
                    onChange={(event) =>
                      updateMissionField("flightDate", event.target.value)
                    }
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-sm font-medium text-zinc-700">
                    Time UTC
                  </span>
                  <input
                    type="time"
                    value={mission.timeUtc}
                    onChange={(event) =>
                      updateMissionField("timeUtc", event.target.value)
                    }
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                  />
                </label>
              </div>
            </section>
          ) : null}

          {visibleTargets.length > 0 ? (
            <section className="grid gap-4">
              {visibleTargets.map((target) => {
                const bucketFiles = filesByBucket[target.bucketId];

                return (
                  <div
                    key={target.bucketId}
                    className="rounded-2xl border border-zinc-200 bg-white p-6"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
                          {target.shortLabel}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-500">
                          {bucketFiles.length} ficheiro
                          {bucketFiles.length === 1 ? "" : "s"}
                        </p>
                      </div>

                      {bucketFiles.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => clearBucket(target.bucketId)}
                          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-950"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>

                    <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-8 text-center transition hover:border-zinc-400 hover:bg-zinc-100">
                      <span className="text-sm font-semibold text-zinc-950">
                        Adicionar a {target.shortLabel}
                      </span>
                      <span className="mt-1 text-sm text-zinc-500">
                        PDF, PNG, JPG, JPEG ou GIF
                      </span>

                      <input
                        type="file"
                        multiple
                        accept={acceptedFiles}
                        onChange={(event) => {
                          addFiles(target, event.target.files);
                          event.currentTarget.value = "";
                        }}
                        className="sr-only"
                      />
                    </label>

                    {bucketFiles.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {bucketFiles.map((file, index) => (
                          <div
                            key={file.id}
                            className="rounded-xl border border-zinc-100 bg-zinc-50 p-4"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-zinc-950">
                                  {index + 1}. {file.name}
                                </p>
                                <p className="mt-0.5 text-xs text-zinc-500">
                                  {formatBytes(file.size)} · {file.type}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => moveFileOrder(file.id, "up")}
                                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 disabled:opacity-40"
                                  disabled={index === 0}
                                >
                                  ↑
                                </button>

                                <button
                                  type="button"
                                  onClick={() => moveFileOrder(file.id, "down")}
                                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 disabled:opacity-40"
                                  disabled={index === bucketFiles.length - 1}
                                >
                                  ↓
                                </button>

                                <select
                                  value={file.bucketId}
                                  onChange={(event) =>
                                    moveFileToBucket(
                                      file.id,
                                      event.target.value as UploadBucketId
                                    )
                                  }
                                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 outline-none"
                                >
                                  {uploadTargets.map((item) => (
                                    <option
                                      key={item.bucketId}
                                      value={item.bucketId}
                                    >
                                      {item.label}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  onClick={() => removeFile(file.id)}
                                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-white"
                                >
                                  Remover
                                </button>
                              </div>
                            </div>

                            <div className="mt-4">
                              <PreviewFrame file={file} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}

          {activeStepId === "routes" ? (
            <section className="space-y-4">
              {routes.map((route, index) => (
                <div
                  key={route.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-6"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-500">
                        Route {index + 1}
                      </p>
                      <input
                        value={route.name}
                        onChange={(event) =>
                          updateRouteName(route.id, event.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-lg font-semibold tracking-tight text-zinc-950 outline-none transition focus:border-zinc-400 md:w-80"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => moveRoute(route.id, "up")}
                        disabled={index === 0}
                        className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() => moveRoute(route.id, "down")}
                        disabled={index === routes.length - 1}
                        className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ↓
                      </button>

                      {routes.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeRoute(route.id)}
                          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-zinc-50"
                        >
                          Remover rota
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                      <p className="text-sm font-semibold text-zinc-950">
                        NavLog
                      </p>

                      <label className="mt-3 block cursor-pointer rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-600 hover:bg-zinc-50">
                        Choose NavLog
                        <input
                          type="file"
                          accept={acceptedFiles}
                          onChange={(event) => {
                            setRouteFile(route.id, "navlog", event.target.files);
                            event.currentTarget.value = "";
                          }}
                          className="sr-only"
                        />
                      </label>

                      {route.navlog ? (
                        <div className="mt-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-medium text-zinc-950">
                              {route.navlog.name}
                            </p>

                            <button
                              type="button"
                              onClick={() => clearRouteFile(route.id, "navlog")}
                              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-white"
                            >
                              Remover
                            </button>
                          </div>

                          <PreviewFrame file={route.navlog} />
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                      <p className="text-sm font-semibold text-zinc-950">
                        VFR Map
                      </p>

                      <label className="mt-3 block cursor-pointer rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-600 hover:bg-zinc-50">
                        Choose VFR Map
                        <input
                          type="file"
                          accept={acceptedFiles}
                          onChange={(event) => {
                            setRouteFile(route.id, "vfrMap", event.target.files);
                            event.currentTarget.value = "";
                          }}
                          className="sr-only"
                        />
                      </label>

                      {route.vfrMap ? (
                        <div className="mt-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-medium text-zinc-950">
                              {route.vfrMap.name}
                            </p>

                            <button
                              type="button"
                              onClick={() => clearRouteFile(route.id, "vfrMap")}
                              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-white"
                            >
                              Remover
                            </button>
                          </div>

                          <PreviewFrame file={route.vfrMap} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addRoute}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-950"
              >
                + Adicionar rota
              </button>
            </section>
          ) : null}

          {activeStepId === "generate" ? (
            <section className="space-y-6">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Mission summary
                </h3>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                      Pilot
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-950">
                      {mission.pilot || "—"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                      Aircraft
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-950">
                      {mission.aircraftType || "—"} ·{" "}
                      {mission.registration || "—"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                      Date / UTC
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-950">
                      {mission.flightDate || "—"} · {mission.timeUtc || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Final PDF order
                </h3>

                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  This is the order used for export. The cover and clickable index are added automatically at the beginning.
                </p>

                <div className="mt-5 space-y-3">
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                    <p className="text-sm font-semibold text-zinc-950">
                      00 · Cover / Index
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      A4 landscape cover with a clickable index.
                    </p>
                  </div>

                  {[
                    {
                      number: "01",
                      title: "Weather",
                      buckets: [
                        { label: "Pressure chart", id: "pressure" },
                        { label: "SIGWX chart", id: "sigwx" },
                        { label: "Wind chart", id: "wind" },
                        { label: "Other", id: "weather_other" },
                      ],
                    },
                    {
                      number: "02",
                      title: "NOTAM",
                      buckets: [
                        { label: "PIB", id: "pib" },
                        { label: "SUP", id: "sup" },
                      ],
                    },
                    {
                      number: "03",
                      title: "PERF/M&B",
                      buckets: [{ label: "Performance & M&B", id: "performance" }],
                    },
                    {
                      number: "04",
                      title: "FPL",
                      buckets: [{ label: "FPL", id: "fpl" }],
                    },
                  ].map((section) => (
                    <div
                      key={section.number}
                      className="rounded-xl border border-zinc-100 bg-zinc-50 p-4"
                    >
                      <p className="text-sm font-semibold text-zinc-950">
                        {section.number} · {section.title}
                      </p>

                      <div className="mt-3 space-y-2">
                        {section.buckets.map((bucket) => {
                          const bucketFiles =
                            filesByBucket[bucket.id as UploadBucketId];

                          return (
                            <div
                              key={bucket.id}
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                            >
                              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                                {bucket.label}
                              </p>

                              {bucketFiles.length === 0 ? (
                                <p className="mt-1 text-sm text-zinc-400">
                                  No files
                                </p>
                              ) : (
                                <ol className="mt-1 space-y-1">
                                  {bucketFiles.map((file, index) => (
                                    <li
                                      key={file.id}
                                      className="text-sm text-zinc-700"
                                    >
                                      {index + 1}. {file.name}
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                    <p className="text-sm font-semibold text-zinc-950">
                      05 · Routes
                    </p>

                    <div className="mt-3 space-y-2">
                      {routes.filter((route) => route.navlog || route.vfrMap)
                        .length === 0 ? (
                        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                          <p className="text-sm text-zinc-400">
                            No routes with files
                          </p>
                        </div>
                      ) : (
                        routes
                          .filter((route) => route.navlog || route.vfrMap)
                          .map((route, index) => (
                            <div
                              key={route.id}
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                            >
                              <p className="text-sm font-medium text-zinc-950">
                                {index + 1}. {route.name}
                              </p>

                              <div className="mt-1 space-y-1 text-sm text-zinc-600">
                                {route.navlog ? (
                                  <p>NavLog: {route.navlog.name}</p>
                                ) : null}

                                {route.vfrMap ? (
                                  <p>VFR Map: {route.vfrMap.name}</p>
                                ) : null}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Export
                </h3>

                <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
                  The PDF is generated locally in the browser. Files are not uploaded to a server at this stage.
                </p>

                <div className="mt-5">
                  {pdfError ? (
                    <p className="mb-3 text-sm text-red-600">{pdfError}</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleGeneratePdf}
                    disabled={isGeneratingPdf}
                    className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    {isGeneratingPdf ? "Generating PDF..." : "Generate PDF"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
          <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={goToPreviousStep}
              disabled={!previousStep}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>

            <div className="flex flex-col gap-3 sm:flex-row">
              {activeStepId !== "generate" ? (
                <button
                  type="button"
                  onClick={goToGenerateStep}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Go to Generate PDF
                </button>
              ) : null}

              <button
                type="button"
                onClick={goToNextStep}
                disabled={!nextStep}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                Next →
              </button>
            </div>
          </section>

        </main>
      </section>
    </div>
  );
}
