(function () {
  var COPY = {
    en: {
      pageTitle: "Join the Screen Armors Team | SCREEN ARMORS",
      title: "Join the Screen Armors Team",
      intro: "Short application for screen and aluminum enclosure work. We will call the phone number you provide.",
      switchLabel: "Español",
      switchAria: "Cambiar a español",
      fullName: "Full name *",
      phone: "Phone number *",
      email: "Email (optional)",
      city: "City where you live *",
      birthYear: "Year of birth *",
      schedule: "Are you looking for full time or part time? *",
      fullTime: "Full time",
      partTime: "Part time",
      screen: "Have you done screen repair or rescreening before? *",
      aluminum: "Have you done aluminum screen enclosure work before? *",
      yes: "Yes",
      no: "No",
      work: "Tell us briefly what work you have done (optional)",
      workHint: "For example: panel changes, pool cage rescreening, door installation, or assembling aluminum structures.",
      start: "When could you start? (optional)",
      startEmpty: "Select if you know",
      startImmediate: "Right away",
      startTwoWeeks: "In 1–2 weeks",
      startLater: "In more than 2 weeks",
      spoken: "Which language do you speak? *",
      spokenEn: "English",
      spokenEs: "Español",
      spokenBoth: "Both / Ambos",
      namePlaceholder: "Your full name",
      emailPlaceholder: "you@email.com",
      cityPlaceholder: "Sarasota",
      birthYearPlaceholder: "1990",
      submit: "Send Application",
      sending: "Sending…",
      confirm: "Thanks for applying to Screen Armors! We’ve received your application and will contact you at the phone number you provided.",
      errors: {
        fullName: "Enter your full name.",
        phone: "Enter a valid U.S. phone number.",
        email: "Enter a valid email address, or leave it blank.",
        city: "Enter the city where you live.",
        birthYear: "Enter a valid year of birth.",
        schedule: "Choose full time or part time.",
        screenExperience: "Please choose Yes or No for screen repair or rescreening.",
        aluminumExperience: "Please choose Yes or No for aluminum screen enclosure work.",
        experienceDescription: "Please shorten what you wrote.",
        availability: "Choose one of the start dates, or leave it blank.",
        language: "Choose English, Español, or Both / Ambos.",
        sendFailed: "We couldn’t send your application. Please try again."
      }
    },
    es: {
      pageTitle: "Únete al equipo de Screen Armors | SCREEN ARMORS",
      title: "Únete al equipo de Screen Armors",
      intro: "Solicitud corta para trabajo de mallas y estructuras de aluminio. Te llamaremos al número de teléfono que nos des.",
      switchLabel: "English",
      switchAria: "Switch to English",
      fullName: "Nombre completo *",
      phone: "Número de teléfono *",
      email: "Correo electrónico (opcional)",
      city: "Ciudad donde vives *",
      birthYear: "Año de nacimiento *",
      schedule: "¿Buscas tiempo completo o medio tiempo? *",
      fullTime: "Tiempo completo",
      partTime: "Medio tiempo",
      screen: "¿Has trabajado antes en reparación de mallas o rescreening? *",
      aluminum: "¿Has trabajado antes con estructuras de aluminio? *",
      yes: "Sí",
      no: "No",
      work: "Cuéntanos brevemente qué trabajos has hecho (opcional)",
      workHint: "Por ejemplo: cambio de paneles, rescreening de pool cages, instalación de puertas o armado de estructuras de aluminio.",
      start: "¿Cuándo podrías empezar? (opcional)",
      startEmpty: "Elige si lo sabes",
      startImmediate: "De inmediato",
      startTwoWeeks: "En 1–2 semanas",
      startLater: "En más de 2 semanas",
      spoken: "¿Qué idioma hablas? *",
      spokenEn: "English",
      spokenEs: "Español",
      spokenBoth: "Both / Ambos",
      namePlaceholder: "Tu nombre completo",
      emailPlaceholder: "tu@correo.com",
      cityPlaceholder: "Sarasota",
      birthYearPlaceholder: "1990",
      submit: "Enviar solicitud",
      sending: "Enviando…",
      confirm: "¡Gracias por postularte a Screen Armors! Recibimos tu solicitud y nos pondremos en contacto contigo al número de teléfono que nos proporcionaste.",
      errors: {
        fullName: "Escribe tu nombre completo.",
        phone: "Escribe un número de teléfono válido de EE. UU.",
        email: "Escribe un correo válido o déjalo en blanco.",
        city: "Escribe la ciudad donde vives.",
        birthYear: "Escribe un año de nacimiento válido.",
        schedule: "Elige tiempo completo o medio tiempo.",
        screenExperience: "Elige Sí o No para reparación de mallas o rescreening.",
        aluminumExperience: "Elige Sí o No para trabajo con estructuras de aluminio.",
        experienceDescription: "Acorta un poco lo que escribiste.",
        availability: "Elige una opción de inicio o déjala en blanco.",
        language: "Elige English, Español o Both / Ambos.",
        sendFailed: "No pudimos enviar tu solicitud. Inténtalo de nuevo."
      }
    }
  };

  var languagePanel = document.getElementById("careersLanguage");
  var applicationPanel = document.getElementById("careersApplication");
  var formView = document.getElementById("careersFormView");
  var form = document.getElementById("careersForm");
  var confirmPanel = document.getElementById("careersConfirm");
  var confirmText = document.getElementById("careersConfirmText");
  var statusEl = document.getElementById("careersStatus");
  var submitBtn = document.getElementById("careersSubmit");
  var langSwitch = document.getElementById("careersLangSwitch");
  var workField = document.getElementById("fieldWork");
  var currentLang = "en";
  var statusKey = "";
  var inFlight = false;

  if (!languagePanel || !form || !submitBtn) return;

  function text(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function isValidBirthYear(value) {
    var raw = String(value || "").trim();
    if (!/^\d{4}$/.test(raw)) return false;
    var year = Number(raw);
    var current = new Date().getFullYear();
    return year >= current - 100 && year <= current - 16;
  }

  function isUsPhone(value) {
    var raw = String(value || "").trim();
    if (!raw || raw.length > 40) return false;
    if (!/^[+()\-.\s\d]+$/.test(raw)) return false;
    var digits = raw.replace(/\D/g, "");
    var national = digits;
    if (digits.length === 11 && digits.charAt(0) === "1") national = digits.slice(1);
    else if (digits.length !== 10) return false;
    return /^[2-9]\d{2}[2-9]\d{6}$/.test(national);
  }

  function isValidEmail(value) {
    if (!value) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function radioValue(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  function applyCopy(lang) {
    var t = COPY[lang] || COPY.en;
    currentLang = lang === "es" ? "es" : "en";
    document.documentElement.lang = currentLang;
    document.title = t.pageTitle;
    text("careersTitle", t.title);
    text("careersIntro", t.intro);
    text("labelFullName", t.fullName);
    text("labelPhone", t.phone);
    text("labelEmail", t.email);
    text("labelCity", t.city);
    text("labelBirthYear", t.birthYear);
    text("labelSchedule", t.schedule);
    text("scheduleFull", t.fullTime);
    text("schedulePart", t.partTime);
    text("labelScreen", t.screen);
    text("labelAluminum", t.aluminum);
    text("screenYes", t.yes);
    text("screenNo", t.no);
    text("aluminumYes", t.yes);
    text("aluminumNo", t.no);
    text("labelWork", t.work);
    text("workHint", t.workHint);
    text("labelStart", t.start);
    text("optAvailabilityEmpty", t.startEmpty);
    text("optImmediate", t.startImmediate);
    text("optTwoWeeks", t.startTwoWeeks);
    text("optLater", t.startLater);
    text("labelSpoken", t.spoken);
    text("spokenEn", t.spokenEn);
    text("spokenEs", t.spokenEs);
    text("spokenBoth", t.spokenBoth);
    text("careersSubmit", inFlight ? t.sending : t.submit);
    langSwitch.textContent = t.switchLabel;
    langSwitch.setAttribute("aria-label", t.switchAria);
    var nameInput = document.getElementById("ca_fullName");
    var emailInput = document.getElementById("ca_email");
    var cityInput = document.getElementById("ca_city");
    var birthYearInput = document.getElementById("ca_birthYear");
    if (nameInput) nameInput.placeholder = t.namePlaceholder;
    if (emailInput) emailInput.placeholder = t.emailPlaceholder;
    if (cityInput) cityInput.placeholder = t.cityPlaceholder;
    if (birthYearInput) birthYearInput.placeholder = t.birthYearPlaceholder;
    if (!confirmPanel.hidden) confirmText.textContent = t.confirm;
    if (statusKey) statusEl.textContent = t.errors[statusKey] || t.errors.sendFailed;
  }

  function showForm(lang, spoken) {
    applyCopy(lang);
    var spokenValue = spoken === "es" || spoken === "both" ? spoken : "en";
    var radio = form.querySelector('input[name="spokenLanguage"][value="' + spokenValue + '"]');
    if (radio) radio.checked = true;
    languagePanel.hidden = true;
    applicationPanel.hidden = false;
    var title = document.getElementById("careersTitle");
    if (title) title.focus();
  }

  function syncWorkField() {
    var show = radioValue("screenExperience") === "yes" || radioValue("aluminumExperience") === "yes";
    workField.hidden = !show;
  }

  function clearInvalid() {
    var marked = form.querySelectorAll(".is-invalid");
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove("is-invalid");
  }

  function markInvalid(field) {
    var map = {
      fullName: "ca_fullName",
      phone: "ca_phone",
      email: "ca_email",
      city: "ca_city",
      birthYear: "ca_birthYear",
      experienceDescription: "ca_work",
      availability: "ca_availability"
    };
    var el = null;
    var focusEl = null;
    if (field === "schedule") el = document.getElementById("fieldSchedule");
    else if (field === "screenExperience") el = document.getElementById("fieldScreen");
    else if (field === "aluminumExperience") el = document.getElementById("fieldAluminum");
    else if (field === "language") el = document.getElementById("fieldLanguage");
    else if (map[field]) el = document.getElementById(map[field]);
    if (!el) return;
    el.classList.add("is-invalid");
    focusEl = el.querySelector ? el.querySelector("input, select, textarea") : null;
    if (!focusEl) focusEl = el;
    if (typeof focusEl.focus === "function") focusEl.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function showError(key) {
    statusKey = key;
    statusEl.textContent = COPY[currentLang].errors[key] || COPY[currentLang].errors.sendFailed;
  }

  function collectPayload() {
    return {
      fullName: fieldValue("ca_fullName"),
      phone: fieldValue("ca_phone"),
      email: fieldValue("ca_email"),
      city: fieldValue("ca_city"),
      birthYear: fieldValue("ca_birthYear"),
      schedule: radioValue("schedule"),
      screenExperience: radioValue("screenExperience"),
      aluminumExperience: radioValue("aluminumExperience"),
      experienceDescription: fieldValue("ca_work"),
      availability: fieldValue("ca_availability"),
      language: radioValue("spokenLanguage"),
      website: fieldValue("ca_website")
    };
  }

  function validate(payload) {
    if (payload.fullName.length < 2 || !/\p{L}/u.test(payload.fullName)) return "fullName";
    if (!isUsPhone(payload.phone)) return "phone";
    if (payload.email && !isValidEmail(payload.email)) return "email";
    if (payload.city.length < 2 || !/\p{L}/u.test(payload.city)) return "city";
    if (!isValidBirthYear(payload.birthYear)) return "birthYear";
    if (payload.schedule !== "full-time" && payload.schedule !== "part-time") return "schedule";
    if (payload.screenExperience !== "yes" && payload.screenExperience !== "no") return "screenExperience";
    if (payload.aluminumExperience !== "yes" && payload.aluminumExperience !== "no") return "aluminumExperience";
    if (payload.experienceDescription.length > 2000) return "experienceDescription";
    if (["", "immediate", "1-2-weeks", "over-2-weeks"].indexOf(payload.availability) === -1) return "availability";
    if (payload.language !== "en" && payload.language !== "es" && payload.language !== "both") return "language";
    return "";
  }

  document.getElementById("chooseEn").addEventListener("click", function () {
    showForm("en", "en");
  });
  document.getElementById("chooseEs").addEventListener("click", function () {
    showForm("es", "es");
  });
  document.getElementById("chooseBoth").addEventListener("click", function () {
    showForm("en", "both");
  });
  langSwitch.addEventListener("click", function () {
    applyCopy(currentLang === "en" ? "es" : "en");
  });

  form.addEventListener("change", syncWorkField);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (inFlight) return;

    clearInvalid();
    statusKey = "";
    statusEl.textContent = "";
    var payload = collectPayload();
    var problem = validate(payload);
    if (problem) {
      showError(problem);
      markInvalid(problem);
      return;
    }

    inFlight = true;
    submitBtn.disabled = true;
    submitBtn.textContent = COPY[currentLang].sending;

    try {
      var res = await fetch("/api/careers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var json = {};
      try {
        json = await res.json();
      } catch (parseError) {
        json = {};
      }

      if (!res.ok || json.ok !== true) {
        var key = "sendFailed";
        if (json && json.error === "validation" && json.fields && json.fields.length && COPY[currentLang].errors[json.fields[0]]) {
          key = json.fields[0];
          markInvalid(key);
        }
        showError(key);
        submitBtn.disabled = false;
        submitBtn.textContent = COPY[currentLang].submit;
        inFlight = false;
        return;
      }

      formView.hidden = true;
      statusEl.textContent = "";
      statusKey = "";
      confirmText.textContent = COPY[currentLang].confirm;
      confirmPanel.hidden = false;
      confirmPanel.focus();
      inFlight = false;
    } catch (networkError) {
      showError("sendFailed");
      submitBtn.disabled = false;
      submitBtn.textContent = COPY[currentLang].submit;
      inFlight = false;
    }
  });
})();
