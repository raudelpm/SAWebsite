import { Resend } from "resend";

function json(res, status, body) {
  return res
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .send(JSON.stringify(body));
}

function getString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseEmailList(value) {
  const raw = getString(value);
  if (!raw) return [];
  return raw
    .split(/[;,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isTestApiRequest(body) {
  const testEmail = getString(body?.email).toLowerCase();
  const testMessage = getString(body?.message);
  const testFirst = getString(body?.firstName);
  const testLast = getString(body?.lastName);
  return (
    testEmail === "test-api@screenarmors.com" ||
    testMessage.includes("TEST API button") ||
    (testFirst === "Test" && testLast === "API")
  );
}

const CONFIRMATION_FROM =
  process.env.CONFIRMATION_FROM_EMAIL || "Screen Armors <info@screenarmors.com>";

function buildConfirmationHtml(firstName) {
  const greeting = firstName
    ? `Hi ${escapeHtml(firstName)},`
    : "Hi,";
  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.6; color: #1a1a1a;">
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">Thank you for contacting Screen Armors. We've received your request and appreciate you reaching out.</p>
      <p style="margin:0 0 16px;">We usually respond within 1 hour during business hours.</p>
      <p style="margin:0 0 8px;">
        Screen Armors<br>
        941-524-6233<br>
        <a href="https://www.screenarmors.com">www.screenarmors.com</a>
      </p>
    </div>
  `.trim();
}

const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
const JOBBER_GRAPHQL_VERSION =
  process.env.JOBBER_GRAPHQL_VERSION || "2025-04-16";
const JOBBER_CLIENT_SEARCH_PAGES = 8;
const JOBBER_CLIENT_PAGE_SIZE = 50;

const JOBBER_CLIENT_CREATE_MUTATION = `
  mutation CreateClient($input: ClientCreateInput!) {
    clientCreate(input: $input) {
      client {
        id
        name
        jobberWebUri
        clientProperties(first: 1) {
          nodes { id }
        }
      }
      userErrors { message path }
    }
  }
`;

const JOBBER_CLIENT_PROPERTY_QUERY = `
  query ClientFirstProperty($id: EncodedId!) {
    client(id: $id) {
      clientProperties(first: 1) {
        nodes { id }
      }
    }
  }
`;

const JOBBER_CUSTOM_FIELD_CONFIG_QUERY = `
  query CustomFieldConfigs {
    customFieldConfigurations(first: 100) {
      nodes {
        ... on CustomFieldConfigurationDropdown {
          id
          name
          appliesTo
          dropdownOptions
        }
      }
    }
  }
`;

const JOBBER_REQUEST_CREATE_INPUT_INTROSPECTION = `
  query RequestCreateInputFields {
    __type(name: "RequestCreateInput") {
      inputFields { name }
    }
  }
`;

const JOBBER_CLIENT_CREATE_INPUT_INTROSPECTION = `
  query ClientCreateInputFields {
    __type(name: "ClientCreateInput") {
      inputFields { name }
    }
  }
`;

const JOBBER_CLIENT_CUSTOM_FIELD_NAMES = {
  projectType: "Type of project",
};

const JOBBER_REQUEST_LEAD_SOURCE_FIELD_NAME = "Lead source";

/** Jobber may use these names for the lead-source dropdown (not only "Lead source"). */
const JOBBER_LEAD_SOURCE_FIELD_ALIASES = [
  "lead source",
  "how did you hear about us?",
  "website lead source",
  "form lead source",
];

const ALLOWED_LEAD_SOURCES = [
  "Google",
  "Referral",
  "Vehicle Wrap",
  "Facebook",
  "Instagram",
  "Yard Signs",
  "Existing Client",
  "Other",
  "Flyer",
];

const JOBBER_FORBIDDEN_LEAD_SOURCE = "Screen Armors Website";

const CLIENT_CREATE_LEAD_SOURCE_FIELD_CANDIDATES = [
  "leadSource",
  "leadSourceName",
  "clientLeadSource",
  "leadSourceId",
];

const JOBBER_CLIENT_EDIT_MUTATION = `
  mutation EditClient($clientId: EncodedId!, $input: ClientEditInput!) {
    clientEdit(clientId: $clientId, input: $input) {
      client { id }
      userErrors { message path }
    }
  }
`;

const JOBBER_REQUEST_CREATE_MUTATION = `
  mutation CreateRequest($input: RequestCreateInput!) {
    requestCreate(input: $input) {
      request { id title requestStatus source jobberWebUri }
      userErrors { message path }
    }
  }
`;

const JOBBER_CLIENT_CREATE_NOTE_MUTATION = `
  mutation CreateClientNote($clientId: EncodedId!, $input: ClientCreateNoteInput!) {
    clientCreateNote(clientId: $clientId, input: $input) {
      clientNote { id }
      userErrors { message path }
    }
  }
`;

const JOBBER_OAUTH_ATTRIBUTION_DOC_URL =
  "https://developer.getjobber.com/docs/using_jobbers_api/api_queries_and_mutations/";

function normalizeUsPhone(value) {
  const digits = getString(value).replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  return digits;
}

/** Jobber ClientCreateInput.phones → PhoneNumberCreateAttributes */
function buildJobberPhoneCreateAttributes(normalizedPhone, { smsAllowed = false } = {}) {
  const attrs = {
    number: normalizedPhone,
    primary: true,
    description: "MAIN",
  };
  if (smsAllowed) attrs.smsAllowed = true;
  return attrs;
}

function isJobberSmsPhoneUserError(message) {
  const lower = getString(message).toLowerCase();
  return (
    lower.includes("cannot receive text messages") ||
    lower.includes("receives text messages") ||
    lower.includes("valid mobile phone")
  );
}

function getJobberUserErrorMessages(userErrors) {
  return (Array.isArray(userErrors) ? userErrors : [])
    .map((e) => getString(e?.message))
    .filter(Boolean);
}

function buildJobberRequestDetails({ leadSource, service, message, phone, email }) {
  const lines = ["Website quote form submission"];
  if (leadSource) lines.push(`Lead source: ${leadSource}`);
  if (service) lines.push(`Service: ${service}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  if (message) lines.push("", message);
  return lines.join("\n");
}

function buildJobberRequestTitle(form) {
  return getString(form.service) || getString(form.projectType) || "Website Quote Request";
}

function buildJobberFormDetailsLog(form) {
  return buildJobberRequestDetails({
    leadSource: form.leadSource,
    service: form.service,
    message: form.message,
    phone: form.phone,
    email: form.email,
  });
}

async function jobberGraphql(accessToken, query, variables) {
  const response = await fetch(JOBBER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_GRAPHQL_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(
      getString(payload?.message) ||
        `Jobber HTTP ${response.status}`
    );
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const err = new Error(payload.errors[0]?.message || "Jobber GraphQL error");
    err.graphqlErrors = payload.errors;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function refreshJobberAccessToken() {
  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;
  const refreshToken = process.env.JOBBER_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Jobber OAuth credentials for token refresh");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const rawText = await response.text();
  let tokenData = {};
  try {
    tokenData = rawText ? JSON.parse(rawText) : {};
  } catch {
    tokenData = {};
  }

  if (!response.ok) {
    throw new Error(
      getString(tokenData?.error_description) ||
        getString(tokenData?.error) ||
        `Token refresh HTTP ${response.status}`
    );
  }

  const accessToken = getString(tokenData?.access_token);
  if (!accessToken) {
    throw new Error("Token refresh succeeded but access_token was missing");
  }

  console.log("[api/request][jobber] Token refreshed");

  return accessToken;
}

async function getJobberAccessToken() {
  let accessToken = getString(process.env.JOBBER_ACCESS_TOKEN);
  if (accessToken) return accessToken;
  return refreshJobberAccessToken();
}

async function jobberGraphqlWithAuth(query, variables) {
  let accessToken = await getJobberAccessToken();

  try {
    return await jobberGraphql(accessToken, query, variables);
  } catch (e) {
    if (e?.status !== 401) throw e;
    console.log("[api/request][jobber] Token rejected, refreshing");
    accessToken = await refreshJobberAccessToken();
    return jobberGraphql(accessToken, query, variables);
  }
}

function clientMatches(node, email, phoneDigits) {
  if (email) {
    const target = email.toLowerCase();
    const emails = Array.isArray(node?.emails) ? node.emails : [];
    if (
      emails.some(
        (item) => getString(item?.address).toLowerCase() === target
      )
    ) {
      return true;
    }
  }

  if (phoneDigits) {
    const phones = Array.isArray(node?.phones) ? node.phones : [];
    if (
      phones.some((item) => normalizeUsPhone(item?.number) === phoneDigits)
    ) {
      return true;
    }
  }

  return false;
}

function getFirstPropertyIdFromClient(client) {
  const nodes = client?.clientProperties?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  return getString(nodes[0]?.id) || null;
}

let cachedCustomFieldConfigs;
let cachedRequestCreateInputFieldNames;
let cachedRequestCreateSupportsCustomFields;
let cachedClientCreateLeadSourceFieldName;
let loggedJobberOAuthAttributionWarning;

function normalizeCustomFieldName(name) {
  return getString(name).toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesLeadSourceCustomFieldName(name) {
  const normalized = normalizeCustomFieldName(name);
  if (!normalized) return false;
  if (JOBBER_LEAD_SOURCE_FIELD_ALIASES.includes(normalized)) return true;
  return (
    normalized.includes("how did you hear") ||
    (normalized.includes("lead") && normalized.includes("source"))
  );
}

function formatLeadSourceCustomFieldConfig(node) {
  const hasDropdown =
    Array.isArray(node?.dropdownOptions) && node.dropdownOptions.length > 0;
  return {
    id: getString(node?.id) || null,
    name: getString(node?.name) || "(unknown)",
    appliesTo: getString(node?.appliesTo) || "(unknown)",
    valueType: hasDropdown ? "dropdown" : "text",
    dropdownOptions: hasDropdown
      ? node.dropdownOptions.map((o) => getString(o)).filter(Boolean)
      : [],
  };
}

function findLeadSourceCustomFieldMatches(configs) {
  return configs.filter((node) => matchesLeadSourceCustomFieldName(node?.name));
}

/** Prefer the dropdown custom field (e.g. "How did you hear about us?") over a text field with the same label. */
function findLeadSourceDropdownConfig(configs) {
  const matches = findLeadSourceCustomFieldMatches(configs);
  const dropdown = matches.find(
    (node) =>
      Array.isArray(node?.dropdownOptions) && node.dropdownOptions.length > 0
  );
  if (!dropdown) return null;

  if (matches.length > 1) {
    console.log("[api/request][jobber] Lead source configs in Jobber", {
      count: matches.length,
      fields: matches.map((n) => ({
        name: getString(n?.name),
        appliesTo: getString(n?.appliesTo),
        type: Array.isArray(n?.dropdownOptions) ? "dropdown" : "text",
      })),
      usingDropdown: getString(dropdown?.name),
    });
  }

  return formatLeadSourceCustomFieldConfig(dropdown);
}

function findClientTextCustomFieldConfigId(configs, targetName) {
  const target = normalizeCustomFieldName(targetName);
  const match = configs.find((node) => {
    const name = normalizeCustomFieldName(node?.name);
    const appliesTo = getString(node?.appliesTo);
    return name === target && appliesTo === "ALL_CLIENTS";
  });
  return getString(match?.id) || null;
}

async function resolveJobberLeadSourceDropdownConfig() {
  const configs = await loadJobberCustomFieldConfigs();
  const config = findLeadSourceDropdownConfig(configs);

  console.log("[api/request][jobber] Lead source dropdown config lookup", {
    configId: config?.id || "(not found)",
    fieldName: config?.name || "(not found)",
    appliesTo: config?.appliesTo || "(not found)",
    optionCount: config?.dropdownOptions?.length ?? 0,
  });

  return config;
}

function pickJobberDropdownValue(leadSource, dropdownOptions) {
  const value = getString(leadSource);
  if (!value) return "";
  if (!Array.isArray(dropdownOptions) || dropdownOptions.length === 0) {
    return value;
  }

  const exact = dropdownOptions.find((option) => getString(option) === value);
  if (exact) return getString(exact);

  const lower = value.toLowerCase();
  const caseInsensitive = dropdownOptions.find(
    (option) => getString(option).toLowerCase() === lower
  );
  return caseInsensitive ? getString(caseInsensitive) : value;
}

function validateJobberLeadSource(leadSource) {
  const value = getString(leadSource);
  if (!value) return undefined;
  if (value === JOBBER_FORBIDDEN_LEAD_SOURCE) {
    console.error(
      "[api/request][jobber] Invalid lead source:",
      value,
      "(forbidden fallback)"
    );
    return undefined;
  }
  if (!ALLOWED_LEAD_SOURCES.includes(value)) {
    console.error("[api/request][jobber] Invalid lead source:", value);
    return undefined;
  }
  return value;
}

async function loadJobberCustomFieldConfigs() {
  if (cachedCustomFieldConfigs !== undefined) {
    return cachedCustomFieldConfigs;
  }

  try {
    const payload = await jobberGraphqlWithAuth(JOBBER_CUSTOM_FIELD_CONFIG_QUERY);
    const nodes = payload?.data?.customFieldConfigurations?.nodes;
    cachedCustomFieldConfigs = Array.isArray(nodes) ? nodes : [];
    return cachedCustomFieldConfigs;
  } catch (e) {
    console.error("[api/request][jobber] Custom field config lookup failed", {
      message: e?.message || String(e),
      hint: "Enable Custom Field Configurations read scope in Jobber Developer Center if dropdown mapping is needed.",
    });
    cachedCustomFieldConfigs = [];
    return cachedCustomFieldConfigs;
  }
}

async function resolveJobberClientCustomFieldConfigIds() {
  const configs = await loadJobberCustomFieldConfigs();
  const projectTypeConfigId = findClientTextCustomFieldConfigId(
    configs,
    JOBBER_CLIENT_CUSTOM_FIELD_NAMES.projectType
  );
  const leadSourceDropdownConfig = findLeadSourceDropdownConfig(configs);

  console.log("[api/request][jobber] Client custom field config lookup", {
    projectTypeConfigId: projectTypeConfigId || "(not found)",
    leadSourceDropdownConfigId: leadSourceDropdownConfig?.id || "(not found)",
    leadSourceDropdownFieldName: leadSourceDropdownConfig?.name || "(not found)",
  });

  return { projectTypeConfigId, leadSourceDropdownConfig };
}

function warnJobberOAuthAppAttribution() {
  if (loggedJobberOAuthAttributionWarning) return;
  loggedJobberOAuthAttributionWarning = true;
  console.warn(
    "[api/request][jobber] Jobber sets Request Source and built-in Client Lead source to your OAuth app display name (often 'Screen Armors Website'). That value is read-only in Jobber and is not sent from our API. Rename the app in the Jobber Developer Center or use the Overview Lead source field and client tags for reporting.",
    { doc: JOBBER_OAUTH_ATTRIBUTION_DOC_URL }
  );
}

async function loadRequestCreateInputFieldNames() {
  if (cachedRequestCreateInputFieldNames !== undefined) {
    return cachedRequestCreateInputFieldNames;
  }

  try {
    const payload = await jobberGraphqlWithAuth(
      JOBBER_REQUEST_CREATE_INPUT_INTROSPECTION
    );
    const fields = payload?.data?.__type?.inputFields;
    cachedRequestCreateInputFieldNames = Array.isArray(fields)
      ? fields.map((field) => getString(field?.name)).filter(Boolean)
      : [];
  } catch (e) {
    console.error(
      "[api/request][jobber] RequestCreateInput introspection failed",
      { message: e?.message || String(e) }
    );
    cachedRequestCreateInputFieldNames = [];
  }

  console.log("[api/request][jobber] RequestCreateInput fields", {
    fields: cachedRequestCreateInputFieldNames,
  });

  return cachedRequestCreateInputFieldNames;
}

async function requestCreateSupportsCustomFields() {
  if (cachedRequestCreateSupportsCustomFields !== undefined) {
    return cachedRequestCreateSupportsCustomFields;
  }

  const fieldNames = await loadRequestCreateInputFieldNames();
  cachedRequestCreateSupportsCustomFields = fieldNames.includes("customFields");

  console.log("[api/request][jobber] RequestCreateInput supports customFields", {
    supported: cachedRequestCreateSupportsCustomFields,
  });

  return cachedRequestCreateSupportsCustomFields;
}

async function requestCreateSupportsSourceField() {
  const fieldNames = await loadRequestCreateInputFieldNames();
  const supported = fieldNames.includes("source");
  console.log("[api/request][jobber] RequestCreateInput supports source", {
    supported,
  });
  if (!supported) warnJobberOAuthAppAttribution();
  return supported;
}

function buildJobberRequestSourceInput(validatedLeadSource, supportsSource) {
  if (!validatedLeadSource || !supportsSource) return {};
  return { source: validatedLeadSource };
}

async function resolveJobberClientCreateLeadSourceFieldName() {
  if (cachedClientCreateLeadSourceFieldName !== undefined) {
    return cachedClientCreateLeadSourceFieldName;
  }

  try {
    const payload = await jobberGraphqlWithAuth(
      JOBBER_CLIENT_CREATE_INPUT_INTROSPECTION
    );
    const fields = payload?.data?.__type?.inputFields;
    if (Array.isArray(fields)) {
      for (const candidate of CLIENT_CREATE_LEAD_SOURCE_FIELD_CANDIDATES) {
        if (fields.some((field) => field?.name === candidate)) {
          cachedClientCreateLeadSourceFieldName = candidate;
          console.log(
            "[api/request][jobber] ClientCreateInput native lead source field",
            { field: candidate }
          );
          return candidate;
        }
      }

      const fuzzy = fields.find((field) => {
        const name = getString(field?.name).toLowerCase();
        return name.includes("lead") && name.includes("source");
      });
      if (fuzzy?.name) {
        cachedClientCreateLeadSourceFieldName = fuzzy.name;
        console.log(
          "[api/request][jobber] ClientCreateInput native lead source field",
          { field: fuzzy.name }
        );
        return fuzzy.name;
      }
    }
  } catch (e) {
    console.error(
      "[api/request][jobber] ClientCreateInput introspection failed",
      { message: e?.message || String(e) }
    );
  }

  cachedClientCreateLeadSourceFieldName = null;
  console.log(
    "[api/request][jobber] ClientCreateInput has no native lead source field in schema"
  );
  warnJobberOAuthAppAttribution();
  return null;
}

function buildJobberClientNativeLeadSourceInput(validatedLeadSource, fieldName) {
  if (!validatedLeadSource || !fieldName) return {};
  return { [fieldName]: validatedLeadSource };
}

function buildJobberClientLeadSourceCustomFieldEntry(
  validatedLeadSource,
  config
) {
  if (!validatedLeadSource || !config?.id) return null;

  if (config.valueType === "dropdown") {
    const valueDropdown = pickJobberDropdownValue(
      validatedLeadSource,
      config.dropdownOptions
    );
    if (!valueDropdown) {
      console.error(
        "[api/request][jobber] Lead source dropdown value not matched",
        {
          fieldName: config.name,
          submitted: validatedLeadSource,
          options: config.dropdownOptions,
        }
      );
      return null;
    }
    console.log("[api/request][jobber] Lead source dropdown selected", {
      fieldName: config.name,
      valueDropdown,
    });
    return {
      customFieldConfigurationId: config.id,
      valueDropdown,
    };
  }

  console.log("[api/request][jobber] Lead source sent as text (no dropdown config)", {
    fieldName: config.name,
    valueText: validatedLeadSource,
  });
  return {
    customFieldConfigurationId: config.id,
    valueText: validatedLeadSource,
  };
}

function buildJobberClientCustomFields(form, configIds, validatedLeadSource) {
  const projectType = getString(form.service) || getString(form.projectType);
  const customFields = [];

  const leadSourceEntry = buildJobberClientLeadSourceCustomFieldEntry(
    validatedLeadSource,
    configIds?.leadSourceDropdownConfig
  );
  if (leadSourceEntry) customFields.push(leadSourceEntry);

  if (projectType && configIds?.projectTypeConfigId) {
    customFields.push({
      customFieldConfigurationId: configIds.projectTypeConfigId,
      valueText: projectType,
    });
  }

  if (customFields.length === 0) return {};
  return { customFields };
}

function buildJobberRequestLeadSourceCustomFields(leadSource, config) {
  if (!leadSource || !config?.id) return {};

  if (config.valueType === "dropdown") {
    const valueDropdown = pickJobberDropdownValue(
      leadSource,
      config.dropdownOptions
    );
    if (!valueDropdown) return {};
    return {
      customFields: [
        {
          customFieldConfigurationId: config.id,
          valueDropdown,
        },
      ],
    };
  }

  return {
    customFields: [
      {
        customFieldConfigurationId: config.id,
        valueText: leadSource,
      },
    ],
  };
}

async function applyJobberClientCustomFields(
  clientId,
  form,
  configIds,
  validatedLeadSource
) {
  const customFieldPatch = buildJobberClientCustomFields(
    form,
    configIds,
    validatedLeadSource
  );
  if (!customFieldPatch.customFields?.length) return;

  const payload = await jobberGraphqlWithAuth(JOBBER_CLIENT_EDIT_MUTATION, {
    clientId,
    input: customFieldPatch,
  });
  const result = payload?.data?.clientEdit;
  const userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];

  if (userErrors.length > 0) {
    throw new Error(
      userErrors.map((e) => getString(e?.message)).filter(Boolean).join("; ") ||
        "clientEdit userErrors (customFields)"
    );
  }

  console.log("[api/request][jobber] Client custom fields updated", {
    clientId,
    fields: customFieldPatch.customFields.map((f) => ({
      configId: f.customFieldConfigurationId,
      valueText: f.valueText,
      valueDropdown: f.valueDropdown,
    })),
  });
}

function buildJobberRequestDetailsInput(form, validatedLeadSource, leadSourceFieldLabel) {
  const leadSource = validatedLeadSource;
  const service = getString(form.service) || getString(form.projectType);
  const message = getString(form.message);
  const leadLabel =
    getString(leadSourceFieldLabel) || JOBBER_REQUEST_LEAD_SOURCE_FIELD_NAME;

  const items = [];
  if (leadSource) {
    items.push({
      label: leadLabel,
      answerText: leadSource,
    });
  }
  if (service) {
    items.push({ label: "Project details", answerText: service });
  }
  if (message) {
    items.push({ label: "Additional details", answerText: message });
  }

  if (items.length === 0) return {};

  return {
    requestDetails: {
      form: {
        sections: [{ label: "Quote form details", items }],
      },
    },
  };
}

async function applyJobberClientLeadSourceTag(clientId, validatedLeadSource) {
  if (!clientId || !validatedLeadSource) return;

  const payload = await jobberGraphqlWithAuth(JOBBER_CLIENT_EDIT_MUTATION, {
    clientId,
    input: { tagsToAdd: [validatedLeadSource] },
  });
  const result = payload?.data?.clientEdit;
  const userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];

  if (userErrors.length > 0) {
    console.error("[api/request][jobber] Client lead source tag failed", {
      clientId,
      tag: validatedLeadSource,
      errors: userErrors.map((e) => getString(e?.message)).filter(Boolean),
    });
    return;
  }

  console.log("[api/request][jobber] Client lead source tag applied", {
    clientId,
    tag: validatedLeadSource,
  });
}

async function createJobberClientLeadSourceNote(clientId, validatedLeadSource) {
  if (!clientId || !validatedLeadSource) return;

  const payload = await jobberGraphqlWithAuth(JOBBER_CLIENT_CREATE_NOTE_MUTATION, {
    clientId,
    input: {
      message: `${JOBBER_REQUEST_LEAD_SOURCE_FIELD_NAME} (website form): ${validatedLeadSource}`,
    },
  });
  const result = payload?.data?.clientCreateNote;
  const userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];

  if (userErrors.length > 0) {
    console.error("[api/request][jobber] Client lead source note failed", {
      clientId,
      leadSource: validatedLeadSource,
      errors: userErrors.map((e) => getString(e?.message)).filter(Boolean),
    });
    return;
  }

  console.log("[api/request][jobber] Client lead source note created", {
    clientId,
    leadSource: validatedLeadSource,
  });
}

async function recordJobberClientLeadSourceVisibility(clientId, validatedLeadSource) {
  if (!clientId || !validatedLeadSource) return;
  await applyJobberClientLeadSourceTag(clientId, validatedLeadSource);
  await createJobberClientLeadSourceNote(clientId, validatedLeadSource);
}

async function fetchJobberClientFirstPropertyId(clientId) {
  const payload = await jobberGraphqlWithAuth(JOBBER_CLIENT_PROPERTY_QUERY, {
    id: clientId,
  });
  const propertyId = getFirstPropertyIdFromClient(payload?.data?.client);
  console.log("[api/request][jobber] Client property lookup", {
    clientId,
    propertyId: propertyId || "(none)",
  });
  return propertyId;
}

async function findExistingJobberClient({ email, phone }) {
  const phoneDigits = normalizeUsPhone(phone);
  if (!email && !phoneDigits) return null;

  console.log("[api/request][jobber] Searching for existing client", {
    email: email || "(none)",
    phone: phoneDigits || "(none)",
  });

  const query = `
    query FindClients($after: String) {
      clients(first: ${JOBBER_CLIENT_PAGE_SIZE}, after: $after) {
        nodes {
          id
          emails { address }
          phones { number }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  let after = null;

  for (let page = 0; page < JOBBER_CLIENT_SEARCH_PAGES; page += 1) {
    const payload = await jobberGraphqlWithAuth(query, { after });
    const connection = payload?.data?.clients;
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];

    for (const node of nodes) {
      if (clientMatches(node, email, phoneDigits)) {
        console.log("[api/request][jobber] Existing client lookup successful", {
          clientId: node.id,
          page: page + 1,
        });
        return node.id;
      }
    }

    const pageInfo = connection?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }

  console.log("[api/request][jobber] No existing client match");
  return null;
}

async function createJobberClient(form) {
  const firstName = getString(form.firstName);
  const lastName = getString(form.lastName);
  const email = getString(form.email);
  const phone = normalizeUsPhone(form.phone);
  const address1 = getString(form.address1);
  const address2 = getString(form.address2);
  const city = getString(form.city);
  const state = getString(form.state);
  const zip = getString(form.zip);
  const customFieldConfigIds = await resolveJobberClientCustomFieldConfigIds();
  const validatedLeadSource = validateJobberLeadSource(form.leadSource);
  const nativeLeadSourceFieldName =
    await resolveJobberClientCreateLeadSourceFieldName();

  console.log(
    "[api/request][jobber] FINAL lead source being sent:",
    form.leadSource
  );

  console.log(
    "[api/request][jobber] Project type custom text sent",
    form.service || form.projectType
  );

  const clientInput = {
    firstName,
    lastName,
    ...(email
      ? {
          emails: [
            { address: email, primary: true, description: "MAIN" },
          ],
        }
      : {}),
    ...(phone
      ? {
          phones: [buildJobberPhoneCreateAttributes(phone, { smsAllowed: true })],
        }
      : {}),
    ...(address1
      ? {
          properties: [
            {
              address: {
                street1: address1,
                ...(address2 ? { street2: address2 } : {}),
                ...(city ? { city } : {}),
                province: state || "FL",
                ...(zip ? { postalCode: zip } : {}),
                country: "United States",
              },
            },
          ],
        }
      : {}),
    ...buildJobberClientNativeLeadSourceInput(
      validatedLeadSource,
      nativeLeadSourceFieldName
    ),
    ...buildJobberClientCustomFields(
      form,
      customFieldConfigIds,
      validatedLeadSource
    ),
  };

  console.log(
    "[api/request][jobber] Client create input sent to Jobber",
    JSON.stringify(clientInput)
  );

  let payload = await jobberGraphqlWithAuth(JOBBER_CLIENT_CREATE_MUTATION, {
    input: clientInput,
  });
  let result = payload?.data?.clientCreate;
  let userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];

  if (
    userErrors.length > 0 &&
    phone &&
    clientInput.phones?.[0]?.smsAllowed &&
    getJobberUserErrorMessages(userErrors).some(isJobberSmsPhoneUserError)
  ) {
    console.warn(
      "[api/request][jobber] clientCreate rejected phone SMS; retrying without smsAllowed",
      { errors: getJobberUserErrorMessages(userErrors) }
    );
    const retryInput = {
      ...clientInput,
      phones: [buildJobberPhoneCreateAttributes(phone, { smsAllowed: false })],
    };
    console.log(
      "[api/request][jobber] Client create retry input sent to Jobber",
      JSON.stringify(retryInput)
    );
    payload = await jobberGraphqlWithAuth(JOBBER_CLIENT_CREATE_MUTATION, {
      input: retryInput,
    });
    result = payload?.data?.clientCreate;
    userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];
  }

  if (userErrors.length > 0) {
    throw new Error(
      getJobberUserErrorMessages(userErrors).join("; ") || "clientCreate userErrors"
    );
  }

  const client = result?.client;
  const clientId = getString(client?.id);
  if (!clientId) throw new Error("clientCreate returned no client id");

  const propertyId = getFirstPropertyIdFromClient(client);

  console.log("[api/request][jobber] Client created", {
    clientId,
    propertyId: propertyId || "(none)",
    jobberWebUri: client?.jobberWebUri,
  });

  if (validatedLeadSource) {
    await recordJobberClientLeadSourceVisibility(clientId, validatedLeadSource);
  }

  return { clientId, propertyId };
}

async function findOrCreateJobberClient(form) {
  const customFieldConfigIds = await resolveJobberClientCustomFieldConfigIds();
  const validatedLeadSource = validateJobberLeadSource(form.leadSource);

  console.log(
    "[api/request][jobber] Project type custom text sent",
    form.service || form.projectType
  );

  const existingId = await findExistingJobberClient({
    email: form.email,
    phone: form.phone,
  });
  if (existingId) {
    const propertyId = await fetchJobberClientFirstPropertyId(existingId);
    await applyJobberClientCustomFields(
      existingId,
      form,
      customFieldConfigIds,
      validatedLeadSource
    );
    if (validatedLeadSource) {
      await recordJobberClientLeadSourceVisibility(existingId, validatedLeadSource);
    }
    return { clientId: existingId, propertyId };
  }
  return createJobberClient(form);
}

async function createJobberRequest({ clientId, propertyId }, form) {
  const validatedLeadSource = validateJobberLeadSource(form.leadSource);

  console.log(
    "[api/request][jobber] Lead source selected on website",
    form.leadSource || "(none)"
  );

  const customFieldConfigIds = await resolveJobberClientCustomFieldConfigIds();
  const leadSourceDropdownConfig =
    customFieldConfigIds.leadSourceDropdownConfig ||
    (await resolveJobberLeadSourceDropdownConfig());
  const supportsRequestSource = await requestCreateSupportsSourceField();
  const supportsRequestCustomFields = await requestCreateSupportsCustomFields();

  const requestLeadSourceCustomFields = leadSourceDropdownConfig
    ? buildJobberRequestLeadSourceCustomFields(
        validatedLeadSource,
        leadSourceDropdownConfig
      )
    : {};

  if (validatedLeadSource) {
    console.log("[api/request][jobber] Lead source for Jobber request", {
      websiteValue: validatedLeadSource,
      dropdownField: leadSourceDropdownConfig?.name || "(not found)",
      requestCustomFieldsAttempt:
        Boolean(requestLeadSourceCustomFields.customFields?.length) ||
        "overview-only",
      schemaSupportsRequestCustomFields: supportsRequestCustomFields,
      note:
        "Lead source report uses native client field (OAuth app name). Website value goes to dropdown custom field + Overview.",
    });
  }

  const requestInput = {
    clientId,
    title: buildJobberRequestTitle(form),
    ...(propertyId ? { propertyId } : {}),
    ...buildJobberRequestSourceInput(validatedLeadSource, supportsRequestSource),
    ...buildJobberRequestDetailsInput(
      form,
      validatedLeadSource,
      leadSourceDropdownConfig?.name
    ),
    ...requestLeadSourceCustomFields,
  };

  if (JOBBER_REQUEST_CREATE_MUTATION.includes("requestCreate(request:")) {
    throw new Error("Invalid Jobber requestCreate mutation signature in source");
  }

  console.log("[api/request][jobber] Request input sent to Jobber", requestInput);

  let payload = await jobberGraphqlWithAuth(JOBBER_REQUEST_CREATE_MUTATION, {
    input: requestInput,
  });
  let result = payload?.data?.requestCreate;
  let userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];

  if (
    userErrors.length > 0 &&
    requestLeadSourceCustomFields.customFields?.length
  ) {
    const customFieldRejected = userErrors.some((e) => {
      const path = Array.isArray(e?.path) ? e.path.join(".") : "";
      return path.includes("customFields") || /custom\s*field/i.test(getString(e?.message));
    });
    if (customFieldRejected) {
      console.warn(
        "[api/request][jobber] requestCreate rejected customFields; retrying with Overview only",
        { errors: userErrors.map((e) => getString(e?.message)).filter(Boolean) }
      );
      const { customFields, ...inputWithoutCustomFields } = requestInput;
      payload = await jobberGraphqlWithAuth(JOBBER_REQUEST_CREATE_MUTATION, {
        input: inputWithoutCustomFields,
      });
      result = payload?.data?.requestCreate;
      userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];
    }
  }

  if (userErrors.length > 0) {
    throw new Error(
      userErrors.map((e) => getString(e?.message)).filter(Boolean).join("; ") ||
        "requestCreate userErrors"
    );
  }

  const requestId = getString(result?.request?.id);
  if (!requestId) throw new Error("requestCreate returned no request id");

  const requestSource = getString(result?.request?.source);
  console.log("[api/request][jobber] Request created", {
    requestId,
    requestStatus: result?.request?.requestStatus,
    requestSource: requestSource || "(none)",
    jobberWebUri: result?.request?.jobberWebUri,
  });
  if (
    requestSource &&
    requestSource === JOBBER_FORBIDDEN_LEAD_SOURCE &&
    validatedLeadSource
  ) {
    console.warn(
      "[api/request][jobber] Request Source still shows OAuth app name; website lead source is in Overview/tags only",
      { websiteLeadSource: validatedLeadSource, requestSource }
    );
  }

  return requestId;
}

async function syncJobberFromQuoteForm(form) {
  if (!getString(process.env.JOBBER_ACCESS_TOKEN) && !getString(process.env.JOBBER_REFRESH_TOKEN)) {
    console.log("[api/request][jobber] Skipped (no Jobber tokens configured)");
    return { created: false, skipped: true };
  }

  const jobberForm = {
    ...form,
    phone: normalizeUsPhone(form.phone) || getString(form.phone),
  };

  console.log("[api/request][jobber] Starting Jobber sync");
  console.log(
    "[api/request][jobber] Full form details (Resend email)",
    buildJobberFormDetailsLog(jobberForm)
  );

  const { clientId, propertyId } = await findOrCreateJobberClient(jobberForm);
  const requestId = await createJobberRequest({ clientId, propertyId }, jobberForm);

  return { created: true, clientId, propertyId, requestId };
}

async function tryJobberSync(form) {
  try {
    const result = await syncJobberFromQuoteForm(form);
    return {
      jobberRequestCreated: Boolean(result.created),
      jobberRequestId: result.requestId || null,
      jobberClientId: result.clientId || null,
      jobberPropertyId: result.propertyId || null,
    };
  } catch (jobberError) {
    console.error("[api/request][jobber] Jobber sync failed", {
      message: jobberError?.message || String(jobberError),
      graphqlErrors: jobberError?.graphqlErrors,
    });
    return {
      jobberRequestCreated: false,
      jobberRequestId: null,
      jobberClientId: null,
      jobberPropertyId: null,
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json(res, 500, { ok: false, error: "Missing RESEND_API_KEY" });

  const toEmailRaw = process.env.REQUEST_TO_EMAIL || process.env.TO_EMAIL;
  const fromEmail = process.env.REQUEST_FROM_EMAIL || process.env.FROM_EMAIL;
  const toEmails = parseEmailList(toEmailRaw);
  if (toEmails.length === 0 || !fromEmail) {
    return json(res, 500, {
      ok: false,
      error: "Missing REQUEST_TO_EMAIL/TO_EMAIL or REQUEST_FROM_EMAIL/FROM_EMAIL",
    });
  }

  let body = req.body;
  // Some deployments may send raw string if content-type is off.
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const firstName = getString(body?.firstName);
  const lastName = getString(body?.lastName);
  const email = getString(body?.email);
  const phone = getString(body?.phone);
  const address1 = getString(body?.address1);
  const address2 = getString(body?.address2);
  const city = getString(body?.city);
  const stateRaw = getString(body?.state);
  const zip = getString(body?.zip);
  const leadSource = getString(body?.leadSource);
  const projectType = getString(body?.projectType);
  const message = getString(body?.message);
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
  const website = getString(body?.website); // honeypot

  if (website) return json(res, 200, { ok: true }); // silently accept bots

  const state = stateRaw ? stateRaw.toUpperCase() : "";
  const addressLines = [address1, address2].filter(Boolean);
  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const address = [addressLines.join("\n"), cityStateZip].filter(Boolean).join("\n");

  // Required fields (match the ones marked with "*" in the form)
  if (!firstName || !lastName || !phone || !leadSource) {
    return json(res, 400, { ok: false, error: "Missing required fields" });
  }

  const fullName = `${firstName}${lastName ? ` ${lastName}` : ""}`.trim();

  if (isTestApiRequest(body)) {
    console.log("[api/request] Test API request — skipping Resend emails", {
      email: email || "(none)",
    });
    const jobber = await tryJobberSync({
      firstName,
      lastName,
      email,
      phone,
      address1,
      address2,
      city,
      state,
      zip,
      leadSource,
      service: projectType,
      projectType,
      message,
      fullName,
    });
    return json(res, 200, {
      ok: true,
      test: true,
      emailsSkipped: true,
      confirmationSent: false,
      jobberRequestCreated: jobber.jobberRequestCreated,
      ...(jobber.jobberRequestId ? { jobberRequestId: jobber.jobberRequestId } : {}),
      ...(jobber.jobberClientId ? { jobberClientId: jobber.jobberClientId } : {}),
    });
  }

  const hasQuickScreen =
    getString(message).includes("Quick Screen Quote") ||
    getString(message).includes("Panel breakdown:");
  const subject = hasQuickScreen
    ? `New quote request (Quick Screen Quote) from ${fullName || "Website"}`
    : `New quote request from ${fullName || "Website"}`;
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.45;">
      <h2 style="margin:0 0 12px;">New quote request</h2>
      <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; width: 140px;"><strong>First name</strong></td><td style="padding: 6px 0;">${escapeHtml(firstName)}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Last name</strong></td><td style="padding: 6px 0;">${escapeHtml(lastName)}</td></tr>
        ${
          address
            ? `<tr><td style="padding: 6px 0;"><strong>Address</strong></td><td style="padding: 6px 0;"><pre style="margin: 0; white-space: pre-wrap; font-family: inherit;">${escapeHtml(address)}</pre></td></tr>`
            : ""
        }
        <tr><td style="padding: 6px 0;"><strong>Phone</strong></td><td style="padding: 6px 0;">${escapeHtml(phone)}</td></tr>
        ${email ? `<tr><td style="padding: 6px 0;"><strong>Email</strong></td><td style="padding: 6px 0;">${escapeHtml(email)}</td></tr>` : ""}
        <tr><td style="padding: 6px 0;"><strong>Lead source</strong></td><td style="padding: 6px 0;">${escapeHtml(leadSource)}</td></tr>
        ${projectType ? `<tr><td style="padding: 6px 0;"><strong>Project</strong></td><td style="padding: 6px 0;">${escapeHtml(projectType)}</td></tr>` : ""}
      </table>
      ${message ? `<h3 style="margin: 16px 0 8px;">Additional Details</h3>
      <pre style="white-space: pre-wrap; margin: 0; padding: 12px; background: #f6f7f9; border-radius: 8px;">${escapeHtml(message)}</pre>` : ""}
    </div>
  `.trim();

  const safeAttachments = attachments
    .slice(0, 3)
    .map((a) => ({
      filename: getString(a?.filename).slice(0, 140) || "photo",
      dataUrl: getString(a?.dataUrl),
      contentType: getString(a?.contentType) || "application/octet-stream",
    }))
    .filter((a) => a.dataUrl.startsWith("data:image/"));

  const resendAttachments =
    safeAttachments.length === 0
      ? undefined
      : safeAttachments.map((a) => {
          const commaIdx = a.dataUrl.indexOf(",");
          const base64 = commaIdx >= 0 ? a.dataUrl.slice(commaIdx + 1) : "";
          return {
            filename: a.filename,
            content: Buffer.from(base64, "base64"),
          };
        });

  console.log("[api/request] Form submission received", {
    fullName,
    customerEmail: email || "(none)",
    leadSource,
    hasAttachments: Boolean(resendAttachments),
  });

  const resend = new Resend(apiKey);

  try {
    console.log("[api/request] Sending internal notification", {
      from: fromEmail,
      to: toEmails,
    });

    const internalResult = await resend.emails.send({
      from: fromEmail,
      to: toEmails.length === 1 ? toEmails[0] : toEmails,
      ...(email ? { replyTo: email } : {}),
      subject,
      html,
      ...(resendAttachments ? { attachments: resendAttachments } : {}),
    });

    if (internalResult.error) {
      console.error("[api/request] Internal notification failed", internalResult.error);
      return json(res, 502, {
        ok: false,
        error: internalResult.error.message || "Resend error (internal)",
      });
    }

    console.log("[api/request] Internal notification sent", {
      id: internalResult.data?.id,
    });

    let confirmationSent = false;
    let confirmationId = null;

    if (isValidEmail(email)) {
      console.log("[api/request] Sending customer confirmation", {
        from: CONFIRMATION_FROM,
        to: email,
      });

      const confirmationResult = await resend.emails.send({
        from: CONFIRMATION_FROM,
        to: email,
        subject: "We Received Your Request",
        html: buildConfirmationHtml(firstName),
      });

      if (confirmationResult.error) {
        console.error("[api/request] Customer confirmation failed", {
          to: email,
          error: confirmationResult.error,
        });

        const jobber = await tryJobberSync({
          firstName,
          lastName,
          email,
          phone,
          address1,
          address2,
          city,
          state,
          zip,
          leadSource,
          service: projectType,
          projectType,
          message,
          fullName,
        });

        return json(res, 200, {
          ok: true,
          id: internalResult.data?.id,
          confirmationSent: false,
          jobberRequestCreated: jobber.jobberRequestCreated,
          confirmationError:
            confirmationResult.error.message ||
            "Resend error (customer confirmation)",
        });
      }

      confirmationSent = true;
      confirmationId = confirmationResult.data?.id;
      console.log("[api/request] Customer confirmation sent", {
        to: email,
        id: confirmationId,
      });
    } else {
      console.log("[api/request] Skipping customer confirmation (no valid email)", {
        email: email || "(empty)",
      });
    }

    const jobber = await tryJobberSync({
      firstName,
      lastName,
      email,
      phone,
      address1,
      address2,
      city,
      state,
      zip,
      leadSource,
      service: projectType,
      projectType,
      message,
      fullName,
    });

    return json(res, 200, {
      ok: true,
      id: internalResult.data?.id,
      confirmationSent,
      jobberRequestCreated: jobber.jobberRequestCreated,
      ...(confirmationId ? { confirmationId } : {}),
      ...(jobber.jobberRequestId ? { jobberRequestId: jobber.jobberRequestId } : {}),
      ...(jobber.jobberClientId ? { jobberClientId: jobber.jobberClientId } : {}),
    });
  } catch (e) {
    console.error("[api/request] Unexpected error", e);
    return json(res, 500, { ok: false, error: e?.message || "Server error" });
  }
}

