window.APP_CONFIG = {
  // Replace with your Oracle Health SMART app client ID.
  clientId: "REPLACE_WITH_ORACLE_CLIENT_ID",

  // Keep launch and patient scopes for EHR launch context.
  scope: "launch/patient patient/Patient.read patient/DocumentReference.write openid profile fhirUser online_access",

  // `launch.html` will redirect to this page after auth.
  redirectPath: "index.html",

  // Document type coding: using LOINC avoids tenant-specific proprietary code system setup.
  docType: {
    system: "http://loinc.org",
    code: "11506-3",
    display: "Progress note"
  }
};
