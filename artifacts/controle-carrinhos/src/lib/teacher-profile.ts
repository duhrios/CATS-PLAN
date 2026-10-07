import { refreshAuthenticatedSession } from "@/lib/auth-session";
import { segments, type Segment, type TeacherProfile } from "@/lib/campus-data";

export type SavedTeacherProfile = TeacherProfile & { className: string };

const parseProfile = (value: unknown): SavedTeacherProfile => {
  if (
    !value ||
    typeof value !== "object" ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !("email" in value) ||
    typeof value.email !== "string" ||
    !("segment" in value) ||
    typeof value.segment !== "string" ||
    !segments.includes(value.segment as Segment) ||
    !("subject" in value) ||
    typeof value.subject !== "string" ||
    !("className" in value) ||
    typeof value.className !== "string"
  ) {
    throw new Error("O servidor retornou um perfil docente inválido.");
  }
  return {
    name: value.name,
    email: value.email,
    segment: value.segment as Segment,
    subject: value.subject,
    className: value.className,
  };
};

const request = async (method: "GET" | "PUT", profile?: TeacherProfile) => {
  const response = await fetch("/api/auth/teacher-profile", {
    method,
    credentials: "same-origin",
    ...(profile
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        }
      : { cache: "no-store" as RequestCache }),
  });
  const result = await response.json().catch(() => null) as
    | (Record<string, unknown> & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(result?.error ?? `Falha ao carregar o perfil (${response.status}).`);
  }
  return parseProfile(result);
};

export const loadTeacherProfile = () => request("GET");

export const saveTeacherProfile = async (profile: TeacherProfile) => {
  const savedProfile = await request("PUT", profile);
  await refreshAuthenticatedSession();
  return savedProfile;
};
