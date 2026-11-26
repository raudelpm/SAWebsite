import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  deleteApplicant,
  listApplicants,
  matchesApplicant,
  normalizeApplicantInput,
  saveWebsiteApplicant,
  seedApplicants,
} from "./applicants-store.js";

const file = path.join(os.tmpdir(), `sa-applicants-${Date.now()}.json`);
process.env.APPLICANTS_FILE = file;
delete process.env.BLOB_READ_WRITE_TOKEN;

let failed = 0;

function assert(label, condition) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${label}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

const seededPeople = seedApplicants();
const tyler = seededPeople.find((item) => item.id === "app_tyler_steger");
const austin = seededPeople.find((item) => item.id === "app_austin_yerian");
const frank = seededPeople.find((item) => item.id === "app_frank");

assert("screen keeps Frank and Tyler", matchesApplicant(frank, { screen: true }) && matchesApplicant(tyler, { screen: true }) && !matchesApplicant(austin, { screen: true }));
assert(
  "screen and metal keeps people who do both",
  matchesApplicant(frank, { screen: true, aluminum: true }) &&
    matchesApplicant(tyler, { screen: true, aluminum: true }) &&
    !matchesApplicant(austin, { screen: true, aluminum: true })
);
assert("cages drops Tyler", !matchesApplicant(tyler, { cages: true }));
assert("part time includes either", matchesApplicant(tyler, { partTime: true }) && matchesApplicant(frank, { partTime: true }) && !matchesApplicant(austin, { partTime: true }));
assert("part time and full time keeps only either", matchesApplicant(tyler, { partTime: true, fullTime: true }) && !matchesApplicant(frank, { partTime: true, fullTime: true }) && !matchesApplicant(austin, { partTime: true, fullTime: true }));
assert("english skips a blank language", !matchesApplicant(tyler, { english: true }) && matchesApplicant(frank, { english: true }));
assert(
  "english and spanish keeps only both",
  matchesApplicant({ language: "both" }, { english: true, spanish: true }) &&
    !matchesApplicant(frank, { english: true, spanish: true })
);
assert("phone search uses digits", matchesApplicant(tyler, { query: "469-4039" }));
assert("unchecked filters keep everyone", matchesApplicant(austin, {}) && matchesApplicant(tyler, {}));

const fromAge = normalizeApplicantInput(
  {
    fullName: "Sam Rivera",
    phone: "941-555-0134",
    city: "Sarasota",
    age: "30",
    schedule: "part-time",
    screenExperience: "yes",
    aluminumExperience: "no",
    cageExperience: "",
    language: "both",
  },
  { now: new Date("2026-11-26T12:00:00.000Z") }
);
assert("age becomes an estimated birth year", fromAge.ok === true && fromAge.applicant.birthYear === "1996" && fromAge.applicant.birthYearEstimated === true && fromAge.applicant.language === "both");

const bad = normalizeApplicantInput({ fullName: "A", phone: "123", city: "" });
assert("phone intake rejects a bad phone", bad.ok === false && bad.fields.includes("phone") && bad.fields.includes("fullName"));

await fs.mkdir(path.dirname(file), { recursive: true });
await fs.writeFile(
  file,
  JSON.stringify({
    seeded: true,
    applicants: seedApplicants().filter((item) => item.id !== "app_jose_aoki"),
  })
);
const migrated = await listApplicants();
assert(
  "an existing list gains Jose once",
  migrated.some((item) => item.fullName === "Jose Aoki" && item.language === "es" && item.screenExperience === "yes")
);
await deleteApplicant("app_jose_aoki");
const afterJoseDelete = await listApplicants();
assert("removing Jose stays removed", afterJoseDelete.every((item) => item.id !== "app_jose_aoki"));

await fs.unlink(file);
const listed = await listApplicants();
assert(
  "empty store seeds Jose, Tyler, Austin, and Frank",
  listed.length === 4 && listed[0].fullName === "Jose Aoki" && listed.some((item) => item.fullName === "Tyler Steger")
);

await saveWebsiteApplicant({
  fullName: "Maria Lopez",
  phone: "941-555-0199",
  email: "",
  city: "Venice",
  birthYear: "1992",
  schedule: "full-time",
  screenExperience: "yes",
  aluminumExperience: "yes",
  experienceDescription: "Rescreening",
  availability: "immediate",
  language: "both",
});
const afterSave = await listApplicants();
assert("website application is stored", afterSave.some((item) => item.fullName === "Maria Lopez" && item.language === "both" && item.source === "website"));

const removed = await deleteApplicant("app_austin_yerian");
const afterDelete = await listApplicants();
assert("delete removes one applicant", removed === true && afterDelete.every((item) => item.id !== "app_austin_yerian"));

await fs.unlink(file).catch(() => {});

if (failed > 0) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("applicant store checks passed");
