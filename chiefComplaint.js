(function () {
  function getTenantIdFromFhirUrl(fhirServerUrl) {
    if (!fhirServerUrl || typeof fhirServerUrl !== "string") {
      throw new Error("FHIR server URL is missing.");
    }

    const url = new URL(fhirServerUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const r4Index = segments.indexOf("r4");

    if (r4Index === -1 || !segments[r4Index + 1]) {
      throw new Error("Unable to parse tenant ID from FHIR server URL: " + fhirServerUrl);
    }

    return segments[r4Index + 1];
  }

  function buildEndpoint(fhirServerUrl, patientId, encounterId, limit) {
    const tenantId = getTenantIdFromFhirUrl(fhirServerUrl);
    const endpoint = new URL(
      "https://api.cernermillennium.com/" + tenantId + "/chiefComplaint/20240101/chiefComplaints"
    );

    endpoint.searchParams.set("patientId", patientId);
    endpoint.searchParams.set("encounterId", encounterId);

    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
      endpoint.searchParams.set("limit", String(limit));
    }

    return endpoint.toString();
  }

  function buildCurlCommand(options) {
    const opts = options || {};
    const endpoint = buildEndpoint(opts.fhirServerUrl, opts.patientId, opts.encounterId, opts.limit);
    const token = opts.accessToken || "<ACCESS_TOKEN>";

    return [
      "curl -X GET \\",
      "  -H \"Authorization: Bearer " + token + "\" \\",
      "  -H \"Accept: application/json\" \\",
      "  \"" + endpoint + "\""
    ].join("\n");
  }

  async function fetchChiefComplaints(options) {
    const opts = options || {};
    const patientId = opts.patientId;
    const encounterId = opts.encounterId;
    const accessToken = opts.accessToken;
    const fhirServerUrl = opts.fhirServerUrl;
    const limit = opts.limit;

    if (!patientId) {
      throw new Error("Chief complaint API requires patientId.");
    }
    if (!encounterId) {
      throw new Error("Chief complaint API requires encounterId.");
    }
    if (!accessToken) {
      throw new Error("Chief complaint API requires access token.");
    }

    const endpoint = buildEndpoint(fhirServerUrl, patientId, encounterId, limit);
    let response;
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: {
          authorization: "Bearer " + accessToken,
          accept: "application/json"
        }
      });
    } catch (error) {
      throw new Error(
        "Chief complaint request was blocked before reaching Oracle API. " +
          "This is usually a browser CORS restriction for api.cernermillennium.com from GitHub Pages. " +
          "Use a small backend proxy for this endpoint. Original error: " +
          (error && error.message ? error.message : String(error))
      );
    }

    const bodyText = await response.text();
    let parsedBody = null;
    try {
      parsedBody = bodyText ? JSON.parse(bodyText) : null;
    } catch (_) {
      parsedBody = bodyText;
    }

    if (!response.ok) {
      throw new Error(
        "Chief complaint request failed (" +
          response.status +
          "): " +
          (typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody))
      );
    }

    return {
      status: response.status,
      endpoint: endpoint,
      nextPage: response.headers.get("oh-next-page"),
      previousPage: response.headers.get("oh-prev-page"),
      body: parsedBody
    };
  }

  window.ChiefComplaintApi = {
    fetchChiefComplaints: fetchChiefComplaints,
    buildEndpoint: buildEndpoint,
    buildCurlCommand: buildCurlCommand
  };
})();
