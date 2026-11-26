/**
 * Validation and internal email for the public /careers application.
 * Notifications go out through the existing lead Resend helper, which
 * delivers to REQUEST_TO_EMAIL (or TO_EMAIL). This project has no
 * separate hiring address.
 */

import { escapeHtml, getString, isValidEmail } from "./lead-email.js";

export const EXPERIENCE_ANSWERS = new Set(["yes", "no"]);
export const SCHEDULE_VALUES = new Set(["full-time", "part-time"]);
export const AVAILABILITY_VALUES = new Set(["", "immediate", "1-2-weeks", "over-2-weeks"]);
export const APPLICATION_LANGUAGES = new Set(["en", "es", "both"]);

const LIMITS = {
  fullName: 120,
  phone: 40,
  email: 200,
  city: 120,
  experienceDescription: 2000,
};

function clean(value) {
  return getString(value).replace(/\u0000/g, "");
}

function hasLetter(value) {
  return /\p{L}/u.test(value);
}

/** Four-digit year, from 100 years ago through 16 years ago. */
export function isValidBirthYear(value, now = new Date()) {
  const raw = clean(value);
  if (!/^\d{4}$/.test(raw)) return false;
  const year = Number(raw);
  const current = now.getFullYear();
  return year >= current - 100 && year <= current - 16;
}

/**
 * Common US formats: (941) 555-0100, 941-555-0100, 941.555.0100,
 * 9415550100, 1-941-555-0100, +1 941 555 0100.
 */
export function isUsPhone(value) {
  const raw = clean(value);
  if (!raw || raw.length > LIMITS.phone) return false;
  if (!/^[+()\-.\s\d]+$/.test(raw)) return false;
  const digits = raw.replace(/\D/g, "");
  let national = digits;
  if (digits.length === 11 && digits.startsWith("1")) national = digits.slice(1);
  else if (digits.length !== 10) return false;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national);
}

function availabilityLabel(value) {
  if (value === "immediate") return "Right away";
  if (value === "1-2-weeks") return "In 1–2 weeks";
  if (value === "over-2-weeks") return "In more than 2 weeks";
  return "Not specified";
}

function yesNoLabel(value) {
  return value === "yes" ? "Yes" : "No";
}

function scheduleLabel(value) {
  return value === "part-time" ? "Part time" : "Full time";
}

function languageLabel(value) {
  if (value === "es") return "Español";
  if (value === "both") return "Both / Ambos";
  return "English";
}

/**
 * @returns {{ ok: true, application: object } | { ok: false, fields: string[] }}
 */
export function validateCareersApplication(input) {
  const fullName = clean(input?.fullName);
  const phone = clean(input?.phone);
  const email = clean(input?.email);
  const city = clean(input?.city);
  const birthYear = clean(input?.birthYear);
  const schedule = clean(input?.schedule).toLowerCase();
  const screenExperience = clean(input?.screenExperience).toLowerCase();
  const aluminumExperience = clean(input?.aluminumExperience).toLowerCase();
  const experienceDescription = clean(input?.experienceDescription);
  const availability = clean(input?.availability);
  const language = clean(input?.language).toLowerCase();
  const fields = [];

  if (fullName.length < 2 || fullName.length > LIMITS.fullName || !hasLetter(fullName)) {
    fields.push("fullName");
  }
  if (!isUsPhone(phone)) fields.push("phone");
  if (email.length > LIMITS.email || (email && !isValidEmail(email))) fields.push("email");
  if (city.length < 2 || city.length > LIMITS.city || !hasLetter(city)) fields.push("city");
  if (!isValidBirthYear(birthYear)) fields.push("birthYear");
  if (!SCHEDULE_VALUES.has(schedule)) fields.push("schedule");
  if (!EXPERIENCE_ANSWERS.has(screenExperience)) fields.push("screenExperience");
  if (!EXPERIENCE_ANSWERS.has(aluminumExperience)) fields.push("aluminumExperience");
  if (experienceDescription.length > LIMITS.experienceDescription) {
    fields.push("experienceDescription");
  }
  if (!AVAILABILITY_VALUES.has(availability)) fields.push("availability");
  if (!APPLICATION_LANGUAGES.has(language)) fields.push("language");

  if (fields.length > 0) return { ok: false, fields };

  return {
    ok: true,
    application: {
      fullName,
      phone,
      email,
      city,
      birthYear,
      schedule,
      screenExperience,
      aluminumExperience,
      experienceDescription,
      availability,
      language,
    },
  };
}

function cell(value) {
  return `<pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${escapeHtml(value)}</pre>`;
}

export function buildCareersEmail(application) {
  const subjectName = application.fullName.replace(/[\r\n]+/g, " ");
  const subject = `New Screen Armors application — ${subjectName}`;
  const rows = [
    ["Name", application.fullName],
    ["Phone", application.phone],
  ];
  if (application.email) rows.push(["Email", application.email]);
  rows.push(
    ["City", application.city],
    ["Year of birth", application.birthYear],
    ["Looking for", scheduleLabel(application.schedule)],
    ["Screen repair or rescreening", yesNoLabel(application.screenExperience)],
    ["Aluminum screen enclosure work", yesNoLabel(application.aluminumExperience)],
    ["Work described", application.experienceDescription || "—"],
    ["Available to start", availabilityLabel(application.availability)],
    ["Language", languageLabel(application.language)]
  );

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.45;">
      <h2 style="margin:0 0 12px;">New job application</h2>
      <table cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
        ${rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:6px 0; width:240px; vertical-align:top;"><strong>${escapeHtml(label)}</strong></td><td style="padding:6px 0;">${cell(value)}</td></tr>`
          )
          .join("")}
      </table>
    </div>
  `.trim();

  return {
    subject,
    html,
    replyTo: application.email || undefined,
  };
}
