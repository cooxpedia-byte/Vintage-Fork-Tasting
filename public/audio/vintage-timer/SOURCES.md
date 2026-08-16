# Vintage timer sound sources

These WAV files are production edits of the licensed source supplied by the
project owner on 2026-08-15:
`ScreenRecording_08-15-2026 16-46-34_1.mov`
(SHA-256
`f768c4b0b1cb5c96792c287112628bbe3e7b7bfdcd0afa8704129d064bee1bef`).

`scripts/generate-vintage-timer-audio.mjs` verifies that exact source hash,
cuts the approved mechanical events, removes sub-bass and ultrasonic recording
noise, applies short boundary fades, limits peaks and exports 44.1 kHz stereo
PCM WAV assets. The wheel uses one deliberately identical, tightly cropped
detent on every step so pitch, attack and spacing stay in a consistent groove.
The licensed source itself is not stored in the repository.
