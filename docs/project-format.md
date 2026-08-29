# VideoCreator Project Format (.vcproj)

VideoCreator projects are stored as versioned JSON documents (`.vcproj`).

## Schema Overview (v1)

```json
{
  "schemaVersion": 1,
  "metadata": {
    "id": "c1f7a4...",
    "name": "My Video Story",
    "author": "Creator",
    "description": "",
    "createdAt": "2026-08-29T14:30:00Z",
    "modifiedAt": "2026-08-29T14:45:00Z",
    "tags": ["vacation", "summer"]
  },
  "canvas": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "aspectRatio": "Ratio9x16",
    "backgroundColorHex": "#000000"
  },
  "timeline": {
    "tracks": [
      {
        "id": "t1",
        "name": "Main Photos",
        "type": "Video",
        "orderIndex": 0,
        "isMuted": false,
        "isLocked": false,
        "volume": 1.0,
        "clips": [
          {
            "$type": "image",
            "id": "c1",
            "name": "photo_01",
            "sourceFilePath": "/path/to/photo.jpg",
            "startTime": "00:00:00",
            "duration": "00:00:03.500",
            "motion": "Cinematic",
            "cropMode": "BlurBackground",
            "transitionOut": {
              "type": "CrossDissolve",
              "duration": "00:00:00.750",
              "easing": "EaseInOut"
            },
            "effects": [
              {
                "type": "Cinematic",
                "intensity": 0.8,
                "isEnabled": true
              }
            ]
          }
        ]
      }
    ]
  },
  "assets": [
    {
      "id": "a1",
      "name": "photo.jpg",
      "filePath": "/path/to/photo.jpg",
      "type": "Image"
    }
  ]
}
```

## Migration Pipeline
The `ProjectSerializer` contains an `IProjectMigration` registry. When an older project version is opened, migrations execute incrementally until the schema reaches `Project.CurrentSchemaVersion`.
