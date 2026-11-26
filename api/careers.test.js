import os from "os";
import path from "path";
import handler from "./careers.js";

const applicantsFile = path.join(os.tmpdir(), `sa-careers-applicants-${Date.now()}.json`);
const previousApplicantsFile = process.env.APPLICANTS_FILE;
const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
process.env.APPLICANTS_FILE = applicantsFile;
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

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(payload) {
      this.body = JSON.parse(payload);
      return this;
    },
  };
}

const ENV_KEYS = [
  "RESEND_API_KEY",
  "REQUEST_TO_EMAIL",
  "TO_EMAIL",
  "REQUEST_FROM_EMAIL",
  "FROM_EMAIL",
];

function saveEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(prev) {
  for (const key of ENV_KEYS) {
    if (prev[key] == null) delete process.env[key];
    else process.env[key] = prev[key];
  }
}

function useLeadEnv() {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.REQUEST_TO_EMAIL = "info@screenarmors.com";
  delete process.env.TO_EMAIL;
  process.env.REQUEST_FROM_EMAIL = "Screen Armors <info@screenarmors.com>";
  delete process.env.FROM_EMAIL;
}

const validBody = {
  fullName: "Sam Rivera",
  phone: "941-555-0134",
  email: "",
  city: "North Port",
  birthYear: "1990",
  schedule: "part-time",
  screenExperience: "no",
  aluminumExperience: "no",
  experienceDescription: "",
  availability: "",
  language: "en",
  website: "",
};

let calls = [];
let failSend = false;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, options) => {
  const body = options?.body ? JSON.parse(options.body) : null;
  calls.push({ url: String(url), body });
  if (failSend) {
    return new Response(JSON.stringify({ message: "forced failure" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ id: "email_test_123" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

async function post(body, method = "POST") {
  const res = mockRes();
  await handler({ method, body }, res);
  return res;
}

const prevEnv = saveEnv();
useLeadEnv();

try {
  calls = [];
  const ok = await post(validBody);
  assert("required-only application is accepted", ok.statusCode === 200 && ok.body.ok === true && ok.body.id === "email_test_123");
  assert("Resend is called once", calls.length === 1);
  assert("recipient is REQUEST_TO_EMAIL", calls[0].body.to === "info@screenarmors.com");
  assert("sender is REQUEST_FROM_EMAIL", calls[0].body.from === "Screen Armors <info@screenarmors.com>");
  assert("subject includes the name", calls[0].body.subject === "New Screen Armors application — Sam Rivera");
  assert("no reply-to without an email", calls[0].body.reply_to == null);
  assert("internal html includes the city and both No answers", calls[0].body.html.includes("North Port") && calls[0].body.html.includes("No"));
  assert("internal html includes part time", calls[0].body.html.includes("Part time"));

  calls = [];
  const withEmail = await post({
    ...validBody,
    email: "sam@example.com",
    screenExperience: "yes",
    experienceDescription: "Pool cage rescreening <b>bold</b>",
    availability: "1-2-weeks",
    language: "es",
  });
  assert("application with email is accepted", withEmail.statusCode === 200 && withEmail.body.ok === true);
  assert("reply-to is set only for a valid email", calls[0].body.reply_to === "sam@example.com");
  assert("description is escaped", calls[0].body.html.includes("&lt;b&gt;") && !calls[0].body.html.includes("<b>"));

  calls = [];
  failSend = true;
  const failedSend = await post(validBody);
  assert("Resend failure stays an error", failedSend.statusCode === 502 && failedSend.body.ok === false && failedSend.body.error === "send_failed");
  failSend = false;

  calls = [];
  const invalid = await post({ ...validBody, phone: "123", email: "bad" });
  assert("server rejects invalid phone and email", invalid.statusCode === 400 && invalid.body.fields.includes("phone") && invalid.body.fields.includes("email"));
  assert("invalid applications are not emailed", calls.length === 0);

  calls = [];
  const honeypot = await post({ ...validBody, website: "http://spam.example" });
  assert("honeypot skips Resend", honeypot.statusCode === 200 && honeypot.body.ok === true && calls.length === 0);

  const wrongMethod = await post(validBody, "GET");
  assert("GET is rejected", wrongMethod.statusCode === 405);

  delete process.env.RESEND_API_KEY;
  calls = [];
  const missingKey = await post(validBody);
  assert("missing Resend config does not confirm", missingKey.statusCode === 500 && missingKey.body.error === "send_failed");
  assert("missing config does not call Resend", calls.length === 0);
} finally {
  restoreEnv(prevEnv);
  globalThis.fetch = originalFetch;
  if (previousApplicantsFile == null) delete process.env.APPLICANTS_FILE;
  else process.env.APPLICANTS_FILE = previousApplicantsFile;
  if (previousBlobToken == null) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken;
}

if (failed > 0) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("careers handler checks passed");
