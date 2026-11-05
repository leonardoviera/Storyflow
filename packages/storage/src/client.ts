import { S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "@storyflow/shared/env";

// research.md R9: internal endpoint for service-to-service I/O; public endpoint only for signing
// URLs the browser fetches. Signing is offline — publicSigner never opens a connection.

let internal: S3Client | undefined;
let publicSigner: S3Client | undefined;

function make(endpoint: string): S3Client {
  const env = getEnv();
  return new S3Client({
    endpoint,
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    forcePathStyle: true,
  });
}

export function internalS3(): S3Client {
  internal ??= make(getEnv().S3_ENDPOINT);
  return internal;
}

export function publicS3Signer(): S3Client {
  const env = getEnv();
  publicSigner ??= make(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT);
  return publicSigner;
}
