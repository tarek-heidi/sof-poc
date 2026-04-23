window.APP_CONFIG = {
  // Replace with your Oracle Health SMART app client ID.
  clientId: "2c821a93-5832-45d3-bf36-9a10311c582f",

  // SMART + Oracle Health EHR scope set for this POC.
  scope: "launch patient/Patient.r patient/Encounter.r patient/DocumentReference.crus user/DocumentReference.crus user/Practitioner.crs openid profile fhirUser online_access oraclehealth:millennium:chief-complaint",

  // `launch.html` will redirect to this page after auth.
  redirectPath: "index.html",

  // Document type coding: using LOINC avoids tenant-specific proprietary code system setup.
  docType: {
    system: "http://loinc.org",
    code: "11506-3",
    display: "Progress note"
  }
};
