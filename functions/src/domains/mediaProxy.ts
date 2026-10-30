import { onRequest } from "firebase-functions/v2/https";
import { storage, admin, IS_STAGING } from "../shared/context";

export const getImage = onRequest({ cors: true }, async (req, res) => {
  if (!IS_STAGING && (req.query.env === "stg" || req.originalUrl.includes("env=stg") || req.originalUrl.includes("env%3Dstg"))) {
    res.redirect(302, `https://tiktak-stg.web.app${req.originalUrl}`);
    return;
  }

  let tenantId = "";
  let imageId = "";

  const queryPath = req.query.path as string;
  if (queryPath) {
    const cleanQueryPath = decodeURIComponent(queryPath).split("?")[0].replace(/\{\{\d+\}\}/g, "").replace(/%7B%7B\d+%7D%7D/gi, "");
    const parts = cleanQueryPath.split('/');
    tenantId = parts[0];
    imageId = parts[1] ? parts[1].replace(/\.[^/.]+$/, "") : "";
  } else {
    const cleanReqPath = decodeURIComponent(req.path).split("?")[0].replace(/\{\{\d+\}\}/g, "").replace(/%7B%7B\d+%7D%7D/gi, "");
    const pathSegments = cleanReqPath.split('/').filter(p => p && p !== 'img');
    tenantId = pathSegments[0];
    imageId = pathSegments[1] ? pathSegments[1].replace(/\.[^/.]+$/, "") : "";
  }

  if (!tenantId || !imageId || imageId === 'view') {
    res.status(400).send("Invalid image path format");
    return;
  }

  try {
    const bucket = storage.bucket();
    const file = bucket.file(`tenants/${tenantId}/${imageId}.jpg`);

    const [exists] = await file.exists();
    if (!exists) {
      if (!IS_STAGING && !req.query.fromProd) {
        res.redirect(302, `https://tiktak-stg.web.app/img/${tenantId}/${imageId}.jpg?fromProd=1`);
        return;
      }
      res.status(404).send("Image not found");
      return;
    }

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '01-01-2100'
    });

    res.redirect(302, url);
  } catch (_err) {
    res.status(500).send("Server error generating image link");
  }
});

export const getAudio = onRequest({ cors: true }, async (req, res) => {
  if (!IS_STAGING && (req.query.env === "stg" || req.originalUrl.includes("env=stg") || req.originalUrl.includes("env%3Dstg"))) {
    res.redirect(302, `https://tiktak-stg.web.app${req.originalUrl}`);
    return;
  }

  let tenantId = "";
  let audioId = "";

  const queryPath = req.query.path as string;
  if (queryPath) {
    const cleanQueryPath = decodeURIComponent(queryPath).split("?")[0].replace(/\{\{\d+\}\}/g, "").replace(/%7B%7B\d+%7D%7D/gi, "");
    const parts = cleanQueryPath.split('/');
    tenantId = parts[0];
    audioId = parts[1] ? parts[1].replace(/\.[^/.]+$/, "") : "";
  } else {
    const cleanReqPath = decodeURIComponent(req.path).split("?")[0].replace(/\{\{\d+\}\}/g, "").replace(/%7B%7B\d+%7D%7D/gi, "");
    const pathSegments = cleanReqPath.split('/').filter(p => p && p !== 'aud' && p !== 'audio');
    tenantId = pathSegments[0];
    audioId = pathSegments[1] ? pathSegments[1].replace(/\.[^/.]+$/, "") : "";
  }

  if (!tenantId || !audioId || audioId === 'view') {
    res.status(400).send("Invalid audio path format");
    return;
  }

  try {
    const bucket = admin.storage().bucket();

    // Search for supported extensions (.mp4, .m4a, .aac, .ogg, .webm, or extensionless)
    const possibleExts = ['.mp4', '.m4a', '.aac', '.ogg', '.webm', ''];
    let file: any = null;
    let exists = false;

    for (const ext of possibleExts) {
      file = bucket.file(`tenants/${tenantId}/${audioId}${ext}`);
      [exists] = await file.exists();
      if (exists) break;
    }

    if (!exists) {
      if (!IS_STAGING && !req.query.fromProd) {
        res.redirect(302, `https://tiktak-stg.web.app/aud/${tenantId}/${audioId}.webm?fromProd=1`);
        return;
      }
      res.status(404).send("Audio not found");
      return;
    }

    const extMatch = file.name.match(/\.([a-z0-9]+)$/i);
    const fileExt = extMatch ? extMatch[1].toLowerCase() : 'mp4';
    const mimeMap: Record<string, string> = {
      'mp4': 'audio/mp4',
      'm4a': 'audio/mp4',
      'aac': 'audio/aac',
      'ogg': 'audio/ogg',
      'webm': 'audio/webm'
    };
    const responseContentType = mimeMap[fileExt] || 'audio/mp4';

    const [buffer] = await file.download();
    res.status(200).set({
      'Content-Type': responseContentType,
      'Content-Length': String(buffer.length),
      'Content-Disposition': `inline; filename="${audioId}.${fileExt}"`,
      'Cache-Control': 'public, max-age=31536000'
    }).send(buffer);
  } catch (_err) {
    res.status(500).send("Server error generating audio link");
  }
});

