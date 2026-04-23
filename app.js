(function () {
  const ui = {
    sessionStatus: document.getElementById("session-status"),
    fhirBase: document.getElementById("fhir-base"),
    patientId: document.getElementById("patient-id"),
    patientName: document.getElementById("patient-name"),
    encounterId: document.getElementById("encounter-id"),
    encounterDate: document.getElementById("encounter-date"),
    practitionerId: document.getElementById("practitioner-id"),
    practitionerName: document.getElementById("practitioner-name"),
    loadPatientBtn: document.getElementById("load-patient-btn"),
    loadChiefComplaintBtn: document.getElementById("load-chief-complaint-btn"),
    chiefComplaint: document.getElementById("chief-complaint"),
    postDocRefBtn: document.getElementById("post-docref-btn"),
    verifyDocRefBtn: document.getElementById("verify-docref-btn"),
    docTitle: document.getElementById("doc-title"),
    docText: document.getElementById("doc-text"),
    output: document.getElementById("output")
  };

  const state = {
    client: null,
    patient: null,
    practitionerId: null,
    patientId: null,
    encounterId: null,
    practitioner: null,
    encounter: null,
    lastCreatedLocation: null,
    chiefComplaint: null
  };

  const LAST_DOCREF_LOCATION_KEY = "heidi_last_docref_location";

  function setOutput(value) {
    ui.output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  function setSessionStatus(message, cssClass) {
    ui.sessionStatus.className = cssClass;
    ui.sessionStatus.textContent = message;
  }

  function toBase64Utf8(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function minutesAgoIso(minutes) {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
  }

  function parsePractitionerId(client) {
    const token = (client.state && client.state.tokenResponse) || {};
    const fhirUser = token.fhirUser || "";
    if (fhirUser.startsWith("Practitioner/")) {
      return fhirUser.split("/")[1] || null;
    }

    if (client.user && typeof client.user.id === "string") {
      return client.user.id;
    }

    return null;
  }

  function getLaunchErrorFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (!error) {
      return null;
    }

    return {
      error: error,
      error_description: params.get("error_description") || null,
      error_uri: params.get("error_uri") || null
    };
  }

  function parsePatientId(client) {
    if (client.patient && client.patient.id) {
      return client.patient.id;
    }

    const token = (client.state && client.state.tokenResponse) || {};
    if (typeof token.patient === "string" && token.patient.length > 0) {
      return token.patient;
    }

    return null;
  }

  function parseEncounterId(client) {
    const token = (client.state && client.state.tokenResponse) || {};
    if (typeof token.encounter === "string" && token.encounter.length > 0) {
      return token.encounter;
    }

    return null;
  }

  function formatHumanDate(value) {
    if (!value) {
      return "-";
    }

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return value;
    }

    return d.toISOString();
  }

  function getHumanName(resource) {
    if (!resource || !Array.isArray(resource.name) || resource.name.length === 0) {
      return "-";
    }

    const preferred = resource.name[0];
    const given = Array.isArray(preferred.given) ? preferred.given.join(" ") : "";
    const family = preferred.family || "";
    const text = preferred.text || "";
    const full = (given + " " + family).trim();

    if (text || full) {
      return text || full;
    }

    // Oracle resources may occasionally omit structured name but include narrative text.
    if (resource.text && typeof resource.text.div === "string") {
      const plain = resource.text.div.replace(/<[^>]+>/g, " ");
      const normalized = plain.replace(/\s+/g, " ").trim();
      const match = normalized.match(/Name\(s\)\s*:\s*([^:]+?)(?:\s+[A-Za-z ]+\s*:|$)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return "-";
  }

  function getEncounterDate(encounter) {
    if (!encounter) {
      return "-";
    }

    if (encounter.period && encounter.period.start) {
      return formatHumanDate(encounter.period.start);
    }

    if (encounter.period && encounter.period.end) {
      return formatHumanDate(encounter.period.end);
    }

    if (encounter.meta && encounter.meta.lastUpdated) {
      return formatHumanDate(encounter.meta.lastUpdated);
    }

    return "-";
  }

  async function loadSessionSummaryResources() {
    const tasks = [];

    if (state.patientId) {
      tasks.push(
        state.client.request("Patient/" + state.patientId).then(function (patient) {
          state.patient = patient;
          ui.patientName.textContent = getHumanName(patient);
        }).catch(function () {
          ui.patientName.textContent = "Unavailable";
        })
      );
    } else {
      ui.patientName.textContent = "-";
    }

    if (state.practitionerId) {
      tasks.push(
        state.client.request("Practitioner/" + state.practitionerId).then(function (practitioner) {
          state.practitioner = practitioner;
          ui.practitionerName.textContent = getHumanName(practitioner);
        }).catch(function () {
          ui.practitionerName.textContent = "Unavailable";
        })
      );
    } else {
      ui.practitionerName.textContent = "-";
    }

    if (state.encounterId) {
      tasks.push(
        state.client.request("Encounter/" + state.encounterId).then(function (encounter) {
          state.encounter = encounter;
          ui.encounterDate.textContent = getEncounterDate(encounter);
        }).catch(function () {
          ui.encounterDate.textContent = "Unavailable (Encounter read not granted)";
        })
      );
    } else {
      ui.encounterDate.textContent = "-";
    }

    await Promise.allSettled(tasks);
  }

  function buildDocumentReference() {
    const patientId = state.patientId;
    const practitionerId = state.practitionerId;
    const encounterId = state.encounterId;
    const appConfig = window.APP_CONFIG || {};
    const docType = appConfig.docType || {};
    const title = ui.docTitle.value.trim() || "HEIDI Sandbox Test Document";
    const text = ui.docText.value.trim() || "Default dummy document content";
    const createdAt = nowIso();

    if (!patientId) {
      throw new Error("Missing patient ID from SMART context.");
    }

    if (!practitionerId) {
      throw new Error("Missing practitioner ID from SMART token (fhirUser).");
    }

    const documentReference = {
      resourceType: "DocumentReference",
      status: "current",
      docStatus: "final",
      type: {
        coding: [
          {
            system: docType.system || "http://loinc.org",
            code: docType.code || "11506-3",
            display: docType.display || "Progress note",
            userSelected: true
          }
        ],
        text: docType.display || "Progress note"
      },
      subject: {
        reference: "Patient/" + patientId
      },
      author: [
        {
          reference: "Practitioner/" + practitionerId
        }
      ],
      content: [
        {
          attachment: {
            contentType: "text/plain;charset=utf-8",
            data: toBase64Utf8(text),
            title: title,
            creation: createdAt
          }
        }
      ],
      context: {
        period: {
          start: minutesAgoIso(5),
          end: createdAt
        }
      }
    };

    if (encounterId) {
      documentReference.context.encounter = [
        {
          reference: "Encounter/" + encounterId
        }
      ];
    }

    return documentReference;
  }

  function openRequestPreview(payload, endpointUrl) {
    return new Promise(function (resolve) {
      const preview = {
        method: "POST",
        url: endpointUrl,
        headers: {
          accept: "application/fhir+json",
          "content-type": "application/fhir+json",
          authorization: "Bearer <redacted>"
        },
        body: payload
      };

      const popup = window.open("", "_blank", "width=900,height=760");
      if (!popup) {
        const accepted = window.confirm(
          "Popup blocked. Proceed with POST DocumentReference?\n\n" +
          JSON.stringify(preview, null, 2)
        );
        resolve(accepted);
        return;
      }

      const html = [
        "<!doctype html>",
        "<html><head><meta charset=\"UTF-8\"><title>Request Preview</title>",
        "<style>",
        "body{font-family:Arial,sans-serif;margin:16px;color:#111827;}",
        "h1{margin-top:0;}",
        "pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-word;}",
        "button{background:#2563eb;border:none;color:#fff;padding:10px 14px;border-radius:6px;cursor:pointer;margin-right:8px;}",
        ".cancel{background:#6b7280;}",
        "</style></head><body>",
        "<h1>DocumentReference Request Preview</h1>",
        "<p>Review request data before sending to Oracle/Cerner.</p>",
        "<pre id=\"payload\"></pre>",
        "<button id=\"send\">Send Request</button>",
        "<button id=\"cancel\" class=\"cancel\">Cancel</button>",
        "<script>",
        "const data=" + JSON.stringify(preview) + ";",
        "document.getElementById('payload').textContent=JSON.stringify(data,null,2);",
        "document.getElementById('send').addEventListener('click',()=>{window.opener && window.opener.postMessage({type:'docref-preview-decision',allow:true},window.location.origin);window.close();});",
        "document.getElementById('cancel').addEventListener('click',()=>{window.opener && window.opener.postMessage({type:'docref-preview-decision',allow:false},window.location.origin);window.close();});",
        "</" + "script>",
        "</body></html>"
      ].join("");

      popup.document.open();
      popup.document.write(html);
      popup.document.close();

      function onMessage(event) {
        if (event.origin !== window.location.origin) {
          return;
        }

        if (!event.data || event.data.type !== "docref-preview-decision") {
          return;
        }

        window.removeEventListener("message", onMessage);
        resolve(Boolean(event.data.allow));
      }

      window.addEventListener("message", onMessage);
    });
  }

  async function postDocumentReference() {
    try {
      ui.postDocRefBtn.disabled = true;
      setOutput("Preparing DocumentReference request...");

      const payload = buildDocumentReference();
      const token = state.client.state && state.client.state.tokenResponse
        ? state.client.state.tokenResponse.access_token
        : null;

      if (!token) {
        throw new Error("Access token is missing.");
      }

      const base = state.client.state.serverUrl.replace(/\/$/, "");
      const requestUrl = base + "/DocumentReference";
      const proceed = await openRequestPreview(payload, requestUrl);
      if (!proceed) {
        setOutput({
          message: "POST cancelled from preview window.",
          payloadPreview: payload
        });
        return;
      }

      setOutput("Posting DocumentReference...");
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "authorization": "Bearer " + token,
          "accept": "application/fhir+json",
          "content-type": "application/fhir+json"
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      const location = response.headers.get("location");

      if (!response.ok) {
        throw new Error(
          "POST failed (" + response.status + "): " + (responseText || "No body returned")
        );
      }

      state.lastCreatedLocation = location;
      if (location) {
        localStorage.setItem(LAST_DOCREF_LOCATION_KEY, location);
      }
      ui.verifyDocRefBtn.disabled = !location;

      setOutput({
        message: "DocumentReference created.",
        status: response.status,
        location: location || "Location header not returned",
        responseBody: responseText || "(empty response body)",
        payloadSent: payload
      });
    } catch (error) {
      setOutput({
        error: error.message || String(error)
      });
    } finally {
      ui.postDocRefBtn.disabled = false;
    }
  }

  async function verifyCreatedDocumentReference() {
    if (!state.lastCreatedLocation) {
      setOutput({
        error: "No created DocumentReference location to verify yet."
      });
      return;
    }

    try {
      ui.verifyDocRefBtn.disabled = true;
      setOutput("Verifying DocumentReference from Location...");

      const token = state.client.state && state.client.state.tokenResponse
        ? state.client.state.tokenResponse.access_token
        : null;

      if (!token) {
        throw new Error("Access token is missing.");
      }

      const response = await fetch(state.lastCreatedLocation, {
        method: "GET",
        headers: {
          "authorization": "Bearer " + token,
          "accept": "application/fhir+json"
        }
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(
          "Verification GET failed (" + response.status + "): " + (responseText || "No body returned")
        );
      }

      let parsed = responseText;
      try {
        parsed = JSON.parse(responseText);
      } catch (_) {
        // Keep plain text if response is not JSON.
      }

      setOutput({
        message: "Verified created DocumentReference.",
        location: state.lastCreatedLocation,
        resource: parsed
      });
    } catch (error) {
      setOutput({
        error: error.message || String(error)
      });
    } finally {
      ui.verifyDocRefBtn.disabled = false;
    }
  }

  async function loadPatient() {
    if (!state.client || !state.patientId) {
      setOutput({ error: "Patient context is missing." });
      return;
    }

    try {
      ui.loadPatientBtn.disabled = true;
      setOutput("Loading patient...");
      const patient = await state.client.request("Patient/" + state.patientId);
      state.patient = patient;
      ui.patientName.textContent = getHumanName(patient);
      setOutput(patient);
    } catch (error) {
      setOutput({ error: error.message || String(error) });
    } finally {
      ui.loadPatientBtn.disabled = false;
    }
  }

  function extractChiefComplaintText(responseBody) {
    if (!responseBody || !Array.isArray(responseBody.items) || responseBody.items.length === 0) {
      return "No chief complaint returned";
    }

    const item = responseBody.items[0];
    const candidates = [
      item.chiefComplaint,
      item.chiefComplaintText,
      item.text,
      item.description,
      item.display,
      item.value
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const value = candidates[i];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    if (item.nomenclature && typeof item.nomenclature.display === "string" && item.nomenclature.display) {
      return item.nomenclature.display;
    }

    return JSON.stringify(item);
  }

  async function loadChiefComplaint() {
    if (!state.client || !state.patientId) {
      setOutput({ error: "Patient context is missing." });
      return;
    }

    if (!state.encounterId) {
      setOutput({ error: "Encounter context is missing. Chief complaint endpoint requires encounterId." });
      return;
    }

    if (!window.ChiefComplaintApi || typeof window.ChiefComplaintApi.fetchChiefComplaints !== "function") {
      setOutput({ error: "Chief complaint module not loaded." });
      return;
    }

    const token = state.client.state && state.client.state.tokenResponse
      ? state.client.state.tokenResponse.access_token
      : null;

    if (!token) {
      setOutput({ error: "Access token is missing." });
      return;
    }

    try {
      ui.loadChiefComplaintBtn.disabled = true;
      setOutput("Loading chief complaint...");

      const result = await window.ChiefComplaintApi.fetchChiefComplaints({
        accessToken: token,
        fhirServerUrl: state.client.state.serverUrl,
        patientId: state.patientId,
        encounterId: state.encounterId,
        limit: 1
      });

      state.chiefComplaint = result.body;
      ui.chiefComplaint.textContent = extractChiefComplaintText(result.body);

      setOutput({
        message: "Chief complaint loaded.",
        endpoint: result.endpoint,
        status: result.status,
        nextPage: result.nextPage || null,
        previousPage: result.previousPage || null,
        responseBody: result.body
      });
    } catch (error) {
      ui.chiefComplaint.textContent = "Unavailable";
      setOutput({
        error: error.message || String(error)
      });
    } finally {
      ui.loadChiefComplaintBtn.disabled = false;
    }
  }

  function wireActions() {
    ui.loadPatientBtn.addEventListener("click", loadPatient);
    ui.loadChiefComplaintBtn.addEventListener("click", loadChiefComplaint);
    ui.postDocRefBtn.addEventListener("click", postDocumentReference);
    ui.verifyDocRefBtn.addEventListener("click", verifyCreatedDocumentReference);
  }

  async function init() {
    wireActions();

    const launchError = getLaunchErrorFromUrl();
    if (launchError) {
      setSessionStatus("SMART launch returned an error.", "err");
      setOutput({
        error: "Authorization server returned an OAuth error.",
        details: launchError,
        hints: [
          "Confirm Oracle app Launch URL is /launch.html",
          "Confirm Redirect URI is /index.html (exact match)",
          "Confirm configured scope is supported by the Oracle app"
        ]
      });
      return;
    }

    try {
      const client = await FHIR.oauth2.ready();
      state.client = client;
      state.practitionerId = parsePractitionerId(client);
      state.patientId = parsePatientId(client);
      state.encounterId = parseEncounterId(client);

      ui.fhirBase.textContent = client.state && client.state.serverUrl ? client.state.serverUrl : "-";
      ui.patientId.textContent = state.patientId || "No patient in token";
      ui.encounterId.textContent = state.encounterId || "No encounter in token";
      ui.practitionerId.textContent = state.practitionerId || "No practitioner in token";
      ui.patientName.textContent = "-";
      ui.practitionerName.textContent = "-";
      ui.encounterDate.textContent = "-";
      ui.chiefComplaint.textContent = "-";

      const persistedLocation = localStorage.getItem(LAST_DOCREF_LOCATION_KEY);
      if (persistedLocation) {
        state.lastCreatedLocation = persistedLocation;
        ui.verifyDocRefBtn.disabled = false;
      } else {
        ui.verifyDocRefBtn.disabled = true;
      }

      if (!state.patientId) {
        setSessionStatus("SMART session found, but no patient context.", "warn");
        setOutput({
          warning: "No patient context in token. For EHR launch, verify launch scope and patient permissions."
        });
        return;
      }

      if (!state.practitionerId) {
        setSessionStatus("SMART session found, but no practitioner context.", "warn");
        setOutput({
          warning: "No practitioner context. Ensure fhirUser claim maps to Practitioner."
        });
      } else {
        setSessionStatus("SMART session ready.", "ok");
      }

      ui.loadPatientBtn.disabled = false;
      ui.loadChiefComplaintBtn.disabled = !state.encounterId;
      ui.postDocRefBtn.disabled = false;
      await loadSessionSummaryResources();
    } catch (error) {
      setSessionStatus("SMART session not ready.", "err");
      ui.fhirBase.textContent = "-";
      setOutput({
        error: "Not in SMART context or launch failed.",
        details: error && error.message ? error.message : String(error),
        nextStep: "Open launch.html from your Oracle SMART launch URL."
      });
      ui.verifyDocRefBtn.disabled = true;
    }
  }

  init();
})();
