// Build-time manifest (optional).
//
// This repo currently doesn't include actual audio asset files. The validator can still
// verify structure and action parameters, and will treat asset existence checks as
// "best effort" using this manifest if populated.
//
// If you later add assets under a tracked folder, you can generate this file to include
// the real filenames (no network requests required).

export const AssetManifest = {
  voices: new Set<string>([]),
  music: new Set<string>([]),
  sounds: new Set<string>([]),
};

