# Firebase Studio

This is a NextJS starter in Firebase Studio.

## Setup

Configure your Firebase Functions environment with the bucket where uploaded files should be stored:

```bash
firebase functions:config:set upload.bucket="<your-bucket>"
```

If this configuration is missing, uploads fail with the error `UPLOAD_BUCKET not set`.

To get started, take a look at src/app/page.tsx.
