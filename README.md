# HEIDI SMART DocRef POC

Minimal static SMART on FHIR app for Oracle Health Sandbox that does two things:

- Load current launch patient
- POST a dummy `DocumentReference`

No build tooling is required. This can be hosted directly on GitHub Pages.

## Files

- `launch.html`: starts SMART OAuth launch (`FHIR.oauth2.authorize`)
- `index.html`: app UI
- `config.js`: app configuration
- `app.js`: patient load + `DocumentReference` POST

## Configure

Edit `config.js`:

- Set `clientId` to your Oracle SMART app client ID
- Keep `scope` aligned with Oracle app registration

Current default scope:

`launch/patient patient/Patient.read patient/DocumentReference.write openid profile fhirUser online_access`

## Oracle App Registration Notes

- Launch URL: `https://<your-github-pages-domain>/<repo>/launch.html`
- Redirect URI: `https://<your-github-pages-domain>/<repo>/index.html`
- Access: provider launch (so author is the logged-in practitioner)
- API access should include:
  - Patient: Read/Search (at minimum read)
  - DocumentReference: Create (and read/search if desired)

## DocumentReference Payload Used

The app sends a minimal supported payload:

- `resourceType: DocumentReference`
- `status: current`
- `docStatus: final`
- `type`: LOINC coding (`http://loinc.org`, code `11506-3`)
- `subject`: current SMART patient (`Patient/<id>`)
- `author`: practitioner from SMART `fhirUser`
- `content[0].attachment`:
  - `contentType: text/plain;charset=utf-8`
  - `data`: base64 encoded plain text
  - `title`, `creation`
- `context.period.start` and `context.period.end` with full timestamp

## Deploy to GitHub Pages

1. Push this folder content to your target repo (for example `heidi` repo).
2. In GitHub repo settings, enable Pages from the branch/folder where these files live.
3. Update Oracle app registration launch + redirect URIs to the Pages URLs.
4. Launch from Oracle sandbox and test:
   - Click `Load Patient`
   - Click `POST DocumentReference`
   - Check `Location` header in output

## Common Failure Points

- `clientId` mismatch with Oracle registration
- Redirect URI mismatch (must match exactly)
- Missing provider identity in token (`fhirUser`)
- Missing `patient/DocumentReference.write` permission
- Invalid payload date or MIME type
# sof-poc
# sof-poc
