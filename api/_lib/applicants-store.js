/**
 * Job applicants for the estimator panel.
 * Website applications and phone intakes share one list.
 * Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise a local JSON file.
 */

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { get, put } from "@vercel/blob";
import { getString, isValidEmail } from "./lead-email.js";
import { isUsPhone, isValidBirthYear } from "./careers-application.js";

const PREFIX = "job-applicants/";
const BLOB_PATH = `${PREFIX}all.json`;

const SCHEDULES = new Set(["full-time", "part-time", "either"]);
const YES_NO = new Set(["yes", "no"]);
const CAGE_VALUES = new Set(["", "yes", "no"]);
const LANGUAGES = new Set(["", "en", "es", "both"]);
const AVAILABILITY = new Set(["", "immediate", "1-2-weeks", "over-2-weeks"]);

const LIMITS = {
  fullName: 120,
  email: 200,
  city: 120,
  experienceDescription: 2000,
  notes: 2000,
  yearsExperience: 40,
};

function localFile() {
  return process.env.APPLICANTS_FILE || path.join(process.cwd(), ".data", "job-applicants.json");
}

function hasBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function clean(value) {
  return getString(value).replace(/\u0000/g, "");
}

function hasLetter(value) {
  return /\p{L}/u.test(value);
}

function newId() {
  return `app_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

let chain = Promise.resolve();

function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** People added after the first seed. Inserted once into an existing list, then left alone if removed. */
const BACKFILL_IDS = new Set(["app_jose_aoki"]);

export function seedApplicants() {
  return [
    {
      id: "app_jose_aoki",
      fullName: "Jose Aoki",
      phone: "9415445652",
      email: "eduardoaokiflores@gmail.com",
      city: "Sarasota",
      birthYear: "1969",
      birthYearEstimated: false,
      schedule: "full-time",
      screenExperience: "yes",
      aluminumExperience: "yes",
      cageExperience: "",
      yearsExperience: "",
      experienceDescription:
        "5 years in CRA Comercial & residential Aluminum\nCut and assembling roof\n5 years in Gulf Gate reescreen\nCut and assembling roof",
      availability: "immediate",
      language: "es",
      notes: "",
      source: "website",
      createdAt: "2026-11-26T14:26:00.000Z",
      updatedAt: "2026-11-26T14:26:00.000Z",
    },
    {
      id: "app_tyler_steger",
      fullName: "Tyler Steger",
      phone: "239-469-4039",
      email: "",
      city: "Port Charlotte",
      birthYear: "2003",
      birthYearEstimated: true,
      schedule: "either",
      screenExperience: "yes",
      aluminumExperience: "yes",
      cageExperience: "no",
      yearsExperience: "3-4",
      experienceDescription:
        "Walk beams, front porch, back porch, screening, and aluminum work. Does not have experience building cages.",
      availability: "",
      language: "",
      notes: "Taken by phone. Age given as 23 on Nov 26, 2026. Looking for part time or full time.",
      source: "phone",
      createdAt: "2026-11-26T14:05:00.000Z",
      updatedAt: "2026-11-26T14:05:00.000Z",
    },
    {
      id: "app_austin_yerian",
      fullName: "Austin Yerian",
      phone: "9413993202",
      email: "her.driver365@icloud.com",
      city: "Bradenton",
      birthYear: "1997",
      birthYearEstimated: false,
      schedule: "full-time",
      screenExperience: "no",
      aluminumExperience: "no",
      cageExperience: "",
      yearsExperience: "",
      experienceDescription: "",
      availability: "immediate",
      language: "en",
      notes: "",
      source: "website",
      createdAt: "2026-11-24T15:00:00.000Z",
      updatedAt: "2026-11-24T15:00:00.000Z",
    },
    {
      id: "app_frank",
      fullName: "Frank",
      phone: "9415807063",
      email: "",
      city: "North Port",
      birthYear: "1985",
      birthYearEstimated: false,
      schedule: "part-time",
      screenExperience: "yes",
      aluminumExperience: "yes",
      cageExperience: "",
      yearsExperience: "",
      experienceDescription: "",
      availability: "",
      language: "en",
      notes: "",
      source: "website",
      createdAt: "2026-11-20T15:00:00.000Z",
      updatedAt: "2026-11-20T15:00:00.000Z",
    },
  ];
}

/**
 * Checked boxes are combined: a person must match every box that is on.
 * "Either" schedule matches Part time and Full time. Checking both keeps only "either".
 * "Both" language matches English and Español. Checking both keeps only "both".
 */
export function matchesApplicant(applicant, filters = {}) {
  const query = String(filters.query || "")
    .trim()
    .toLowerCase();
  if (query) {
    const haystack = [
      applicant?.fullName,
      applicant?.phone,
      applicant?.email,
      applicant?.city,
      applicant?.experienceDescription,
      applicant?.notes,
      applicant?.yearsExperience,
    ]
      .join(" ")
      .toLowerCase();
    const digits = query.replace(/\D/g, "");
    const phoneDigits = String(applicant?.phone || "").replace(/\D/g, "");
    const textHit = haystack.includes(query) || (digits.length >= 3 && phoneDigits.includes(digits));
    if (!textHit) return false;
  }

  if (filters.screen && applicant?.screenExperience !== "yes") return false;
  if (filters.aluminum && applicant?.aluminumExperience !== "yes") return false;
  if (filters.cages && applicant?.cageExperience !== "yes") return false;

  if (filters.partTime && filters.fullTime) {
    if (applicant?.schedule !== "either") return false;
  } else if (filters.partTime) {
    if (applicant?.schedule !== "part-time" && applicant?.schedule !== "either") return false;
  } else if (filters.fullTime) {
    if (applicant?.schedule !== "full-time" && applicant?.schedule !== "either") return false;
  }

  if (filters.english && filters.spanish) {
    if (applicant?.language !== "both") return false;
  } else if (filters.english) {
    if (applicant?.language !== "en" && applicant?.language !== "both") return false;
  } else if (filters.spanish) {
    if (applicant?.language !== "es" && applicant?.language !== "both") return false;
  }

  return true;
}

/**
 * Phone intake. Website posts use saveWebsiteApplicant after the public form is validated.
 * @returns {{ ok: true, applicant: object } | { ok: false, fields: string[] }}
 */
export function normalizeApplicantInput(input, { existing, now = new Date() } = {}) {
  const fullName = clean(input?.fullName);
  const phone = clean(input?.phone);
  const email = clean(input?.email);
  const city = clean(input?.city);
  let birthYear = clean(input?.birthYear);
  const ageRaw = clean(input?.age);
  let birthYearEstimated = false;
  const schedule = clean(input?.schedule).toLowerCase();
  const screenExperience = clean(input?.screenExperience).toLowerCase();
  const aluminumExperience = clean(input?.aluminumExperience).toLowerCase();
  const cageExperience = clean(input?.cageExperience).toLowerCase();
  const yearsExperience = clean(input?.yearsExperience);
  const experienceDescription = clean(input?.experienceDescription);
  const availability = clean(input?.availability);
  const language = clean(input?.language).toLowerCase();
  const notes = clean(input?.notes);
  const fields = [];

  if (fullName.length < 2 || fullName.length > LIMITS.fullName || !hasLetter(fullName)) {
    fields.push("fullName");
  }
  if (!isUsPhone(phone)) fields.push("phone");
  if (email.length > LIMITS.email || (email && !isValidEmail(email))) fields.push("email");
  if (city.length < 2 || city.length > LIMITS.city || !hasLetter(city)) fields.push("city");

  if (birthYear) {
    if (!isValidBirthYear(birthYear, now)) fields.push("birthYear");
  } else if (ageRaw) {
    const age = Number(ageRaw);
    const current = now.getFullYear();
    if (!/^\d{2}$/.test(ageRaw) || age < 16 || age > 80) fields.push("age");
    else {
      birthYear = String(current - age);
      birthYearEstimated = true;
    }
  }

  if (!SCHEDULES.has(schedule)) fields.push("schedule");
  if (!YES_NO.has(screenExperience)) fields.push("screenExperience");
  if (!YES_NO.has(aluminumExperience)) fields.push("aluminumExperience");
  if (!CAGE_VALUES.has(cageExperience)) fields.push("cageExperience");
  if (yearsExperience.length > LIMITS.yearsExperience) fields.push("yearsExperience");
  if (experienceDescription.length > LIMITS.experienceDescription) fields.push("experienceDescription");
  if (!AVAILABILITY.has(availability)) fields.push("availability");
  if (!LANGUAGES.has(language)) fields.push("language");
  if (notes.length > LIMITS.notes) fields.push("notes");

  if (fields.length > 0) return { ok: false, fields };

  const stamp = now.toISOString();
  return {
    ok: true,
    applicant: {
      id: existing?.id || newId(),
      fullName,
      phone,
      email,
      city,
      birthYear,
      birthYearEstimated,
      schedule,
      screenExperience,
      aluminumExperience,
      cageExperience,
      yearsExperience,
      experienceDescription,
      availability,
      language,
      notes,
      source: "phone",
      createdAt: existing?.createdAt || stamp,
      updatedAt: stamp,
    },
  };
}

export async function saveWebsiteApplicant(application) {
  const stamp = new Date().toISOString();
  const record = {
    id: newId(),
    fullName: application.fullName,
    phone: application.phone,
    email: application.email || "",
    city: application.city,
    birthYear: application.birthYear,
    birthYearEstimated: false,
    schedule: application.schedule,
    screenExperience: application.screenExperience,
    aluminumExperience: application.aluminumExperience,
    cageExperience: "",
    yearsExperience: "",
    experienceDescription: application.experienceDescription || "",
    availability: application.availability || "",
    language: application.language,
    notes: "",
    source: "website",
    createdAt: stamp,
    updatedAt: stamp,
  };
  return saveApplicant(record);
}

async function readBlobJson(pathname) {
  try {
    const got = await get(pathname, {
      access: "private",
      useCache: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!got || got.statusCode !== 200 || !got.stream) return null;
    const text = await new Response(got.stream).text();
    return JSON.parse(text);
  } catch (error) {
    if (error && (error.statusCode === 404 || error.name === "BlobNotFoundError")) return null;
    throw error;
  }
}

function backfillApplicants(applicants, ensuredIds) {
  const list = Array.isArray(applicants) ? applicants.slice() : [];
  const ensured = new Set(Array.isArray(ensuredIds) ? ensuredIds : []);
  let changed = !Array.isArray(ensuredIds);
  for (const person of seedApplicants()) {
    if (!BACKFILL_IDS.has(person.id) || ensured.has(person.id)) continue;
    if (!list.some((item) => item.id === person.id)) {
      list.unshift(person);
      changed = true;
    }
    ensured.add(person.id);
    changed = true;
  }
  return { applicants: list, ensuredIds: [...ensured], changed };
}

async function readBlobAll() {
  const data = await readBlobJson(BLOB_PATH);
  if (data && data.seeded) {
    const next = backfillApplicants(data.applicants, data.ensuredIds);
    if (next.changed) await writeBlobAll(next.applicants, next.ensuredIds);
    return next.applicants;
  }
  const seeded = seedApplicants();
  await writeBlobAll(seeded, [...BACKFILL_IDS]);
  return seeded;
}

async function writeBlobAll(applicants, ensuredIds = [...BACKFILL_IDS]) {
  await put(
    BLOB_PATH,
    JSON.stringify(
      { seeded: true, ensuredIds, applicants, updatedAt: new Date().toISOString() },
      null,
      2
    ),
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }
  );
}

async function readLocalAll() {
  try {
    const raw = await fs.readFile(localFile(), "utf8");
    const data = JSON.parse(raw);
    if (!data || data.seeded !== true) {
      const seeded = seedApplicants();
      await writeLocalAll(seeded, [...BACKFILL_IDS]);
      return seeded;
    }
    const next = backfillApplicants(data.applicants, data.ensuredIds);
    if (next.changed) await writeLocalAll(next.applicants, next.ensuredIds);
    return next.applicants;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      const seeded = seedApplicants();
      await writeLocalAll(seeded, [...BACKFILL_IDS]);
      return seeded;
    }
    throw error;
  }
}

async function writeLocalAll(applicants, ensuredIds = [...BACKFILL_IDS]) {
  const file = localFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify(
      { seeded: true, ensuredIds, applicants, updatedAt: new Date().toISOString() },
      null,
      2
    ),
    "utf8"
  );
}

async function readAll() {
  return hasBlob() ? readBlobAll() : readLocalAll();
}

async function currentEnsuredIds() {
  if (hasBlob()) {
    const data = await readBlobJson(BLOB_PATH);
    return Array.isArray(data?.ensuredIds) ? data.ensuredIds : [...BACKFILL_IDS];
  }
  try {
    const raw = await fs.readFile(localFile(), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data?.ensuredIds) ? data.ensuredIds : [...BACKFILL_IDS];
  } catch {
    return [...BACKFILL_IDS];
  }
}

async function writeAll(applicants) {
  const ensuredIds = await currentEnsuredIds();
  if (hasBlob()) await writeBlobAll(applicants, ensuredIds);
  else await writeLocalAll(applicants, ensuredIds);
}

export async function listApplicants() {
  return enqueue(async () => {
    const applicants = await readAll();
    return applicants
      .slice()
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  });
}

export async function saveApplicant(applicant) {
  return enqueue(async () => {
    const applicants = await readAll();
    const idx = applicants.findIndex((item) => item.id === applicant.id);
    if (idx >= 0) applicants[idx] = applicant;
    else applicants.unshift(applicant);
    await writeAll(applicants);
    return applicant;
  });
}

export async function deleteApplicant(id) {
  return enqueue(async () => {
    if (!id) return false;
    const applicants = await readAll();
    const next = applicants.filter((item) => item.id !== id);
    if (next.length === applicants.length) return false;
    await writeAll(next);
    return true;
  });
}

export function storageMode() {
  return hasBlob() ? "blob" : "local-file";
}
