import {
  buildCareersEmail,
  isUsPhone,
  isValidBirthYear,
  validateCareersApplication,
} from "./careers-application.js";

let failed = 0;

function assert(label, condition) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${label}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

const validBase = {
  fullName: "Sam Rivera",
  phone: "(941) 555-0134",
  email: "",
  city: "Sarasota",
  birthYear: "1990",
  schedule: "full-time",
  screenExperience: "no",
  aluminumExperience: "no",
  experienceDescription: "",
  availability: "",
  language: "es",
};

const requiredOnly = validateCareersApplication(validBase);
assert("required fields only, no email and no experience", requiredOnly.ok === true);

for (const phone of [
  "(941) 555-0134",
  "941-555-0134",
  "941.555.0134",
  "941 555 0134",
  "9415550134",
  "1-941-555-0134",
  "+1 (941) 555-0134",
  "+19415550134",
]) {
  assert(`accepts US phone ${phone}`, isUsPhone(phone));
}

for (const phone of ["941-555-013", "000-555-0134", "123-555-0134", "941-155-0134", "call me", ""]) {
  assert(`rejects phone ${phone || "(empty)"}`, !isUsPhone(phone));
}

assert("accepts a working-age birth year", isValidBirthYear("1990"));
assert("rejects a missing birth year", !isValidBirthYear(""));
assert("rejects a birth year that is too recent", !isValidBirthYear(String(new Date().getFullYear() - 10)));
assert("rejects a birth year that is not four digits", !isValidBirthYear("90"));

const missingYear = validateCareersApplication({ ...validBase, birthYear: "" });
assert("missing birth year fails", missingYear.ok === false && missingYear.fields.includes("birthYear"));

const missingSchedule = validateCareersApplication({ ...validBase, schedule: "" });
assert("missing schedule fails", missingSchedule.ok === false && missingSchedule.fields.includes("schedule"));

const partTime = validateCareersApplication({ ...validBase, schedule: "part-time" });
assert("part time is accepted", partTime.ok === true && partTime.application.schedule === "part-time");

const missingName = validateCareersApplication({ ...validBase, fullName: " " });
assert("missing name fails", missingName.ok === false && missingName.fields.includes("fullName"));

const badEmail = validateCareersApplication({ ...validBase, email: "not-an-email" });
assert("invalid email fails", badEmail.ok === false && badEmail.fields.includes("email"));

const withEmail = validateCareersApplication({
  ...validBase,
  email: "sam@example.com",
  screenExperience: "yes",
  experienceDescription: "Panel changes and <script>alert(1)</script>",
  availability: "immediate",
  language: "en",
});
assert("yes experience without requiring a resume", withEmail.ok === true);

const built = buildCareersEmail(withEmail.application);
assert(
  "subject uses the applicant name",
  built.subject === "New Screen Armors application — Sam Rivera"
);
assert("reply-to is the applicant email", built.replyTo === "sam@example.com");
assert("html escapes description", built.html.includes("&lt;script&gt;") && !built.html.includes("<script>"));
assert("html includes both experience answers", built.html.includes("Yes") && built.html.includes("Screen repair or rescreening"));

const noEmail = buildCareersEmail(requiredOnly.application);
assert("no reply-to when email is blank", noEmail.replyTo === undefined);
assert("blank email is omitted from the body", !noEmail.html.includes(">Email<"));
assert("no experience is still included", noEmail.html.includes("No") && noEmail.html.includes("Not specified"));
assert("chosen language is included", noEmail.html.includes("Español"));

const bothLang = validateCareersApplication({ ...validBase, language: "both" });
assert("both languages is accepted", bothLang.ok === true && bothLang.application.language === "both");
const bothEmail = buildCareersEmail(bothLang.application);
assert("both languages is labeled Both / Ambos", bothEmail.html.includes("Both / Ambos"));

const unknownLang = validateCareersApplication({ ...validBase, language: "fr" });
assert("unknown language fails", unknownLang.ok === false && unknownLang.fields.includes("language"));
assert("birth year is included", noEmail.html.includes("1990") && noEmail.html.includes("Year of birth"));
assert("full time is included", noEmail.html.includes("Looking for") && noEmail.html.includes("Full time"));
const partTimeEmail = buildCareersEmail(partTime.application);
assert("part time is included", partTimeEmail.html.includes("Part time"));

const injected = validateCareersApplication({ ...validBase, fullName: "Ann & Bob\r\nBcc: x" });
const injectedEmail = buildCareersEmail(injected.application);
assert("ampersand is escaped", injectedEmail.html.includes("Ann &amp; Bob"));
assert("subject has no line break", !/[\r\n]/.test(injectedEmail.subject));

if (failed > 0) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("careers application checks passed");
