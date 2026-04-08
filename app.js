(function () {
  const ui = {
    sessionStatus: document.getElementById("session-status"),
    fhirBase: document.getElementById("fhir-base"),
    patientId: document.getElementById("patient-id"),
    encounterId: document.getElementById("encounter-id"),
    practitionerId: document.getElementById("practitioner-id"),
    loadPatientBtn: document.getElementById("load-patient-btn"),
    postDocRefBtn: document.getElementById("post-docref-btn"),
    docTitle: document.getElementById("doc-title"),
    docText: document.getElementById("doc-text"),
    output: document.getElementById("output")
  };

  const state = {
    client: null,
    patient: null,
    practitionerId: null,
    patientId: null,
    encounterId: null
  };

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

  async function postDocumentReference() {
    try {
      ui.postDocRefBtn.disabled = true;
      setOutput("Posting DocumentReference...");

      const payload = buildDocumentReference();
      const token = state.client.state && state.client.state.tokenResponse
        ? state.client.state.tokenResponse.access_token
        : null;

      if (!token) {
        throw new Error("Access token is missing.");
      }

      const base = state.client.state.serverUrl.replace(/\/$/, "");
      const response = await fetch(base + "/DocumentReference", {
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
      setOutput(patient);
    } catch (error) {
      setOutput({ error: error.message || String(error) });
    } finally {
      ui.loadPatientBtn.disabled = false;
    }
  }

  function wireActions() {
    ui.loadPatientBtn.addEventListener("click", loadPatient);
    ui.postDocRefBtn.addEventListener("click", postDocumentReference);
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
      ui.postDocRefBtn.disabled = false;
    } catch (error) {
      setSessionStatus("SMART session not ready.", "err");
      ui.fhirBase.textContent = "-";
      setOutput({
        error: "Not in SMART context or launch failed.",
        details: error && error.message ? error.message : String(error),
        nextStep: "Open launch.html from your Oracle SMART launch URL."
      });
    }
  }

  init();
})();
