---
name: models-and-assets
description: How to add 3D models, textures, animations and audio, including formats, budgets, naming and licensing. Use whenever a binary asset is added or changed.
---

# Models and assets

The game has no asset files yet: guns and arms are built in code (see the `weapons`
skill), surfaces come from the shared library (see `textures`) and sound is synthesised
(see `sound`). Code-built models are blocky. These are the rules for real asset files
when they arrive.

Start every asset from a reference image, following the `reference-images` skill.

## Formats

| Asset     | Format                                                   |
| --------- | -------------------------------------------------------- |
| Models    | glTF binary (`.glb`), loaded with Three.js `GLTFLoader`  |
| Textures  | KTX2 where possible; otherwise WebP or PNG. Power-of-two |
| Audio     | Ogg Vorbis or MP3; short effects mono                    |
| Materials | PBR metallic-roughness                                   |

## Location and naming

Shipped files go in `public/assets/<kind>/`, lowercase kebab-case:
`public/assets/models/rifle-ar.glb`, `public/assets/textures/concrete-wall-albedo.ktx2`.
Source files (`.blend`, `.psd`, `.fbx`) do not go in this repo.

## Authoring conventions

- One unit is one metre. Y up. Characters and weapons face -Z.
- Apply transforms before export. Origin at the feet for characters, at the grip for
  weapons, at the base centre for props.
- Name nodes the code will look up (`muzzle`, `grip`, `eject`) and document them.

## Starting budgets

These are starting points for a browser target. Measure and revise them.

| Asset               | Triangles | Texture size |
| ------------------- | --------- | ------------ |
| First-person weapon | up to 20k | 2048         |
| Character           | up to 30k | 2048         |
| Large prop          | up to 5k  | 1024         |
| Small prop          | up to 1k  | 512          |

Keep any single file under about 5 MB. If binary assets start to bloat the repository,
stop and raise it: the project will need Git LFS or external storage.

## Licensing

Every asset not made for this project needs a row in `public/assets/CREDITS.md`
(create it with the first asset): file, author, source URL, licence. Only use assets
whose licence permits redistribution in a game. Do not add assets ripped from other
games. If an asset was AI-generated, record the tool.

## Quality bar

Consistent art direction matters more than detail on any single model. Before adding
an asset, compare it in-engine beside existing ones: scale, texel density, material
response under the scene lighting, silhouette at gameplay distance.

## Verification

Load it in `npm run dev`. Check the console for loader warnings, check scale against
the 1.7 m eye height, and check the build size change with `npm run build`.
