# PRD: Audio Voice Notes for Reports

## 1. Goal & Vision
Enhance the "Snap & Send" experience by allowing residents to record a short audio memo when images alone aren't enough to describe an issue. This ensures the building committee (Vaad) receives crystal-clear context in under 15 seconds.

## 2. Core Features
- **Hold-to-Record**: A dedicated button in the reporting form that records while held, up to a 10-second limit.
- **Delete/Re-record**: Option to discard an audio note and record a new one before submission.
- **Identical Media Identity**: Audio and image files share the exact same ID base (e.g., `{id}.jpg` and `{id}.webm`) for perfect multi-media synchronization.
- **WhatsApp Bridge**: Automatically include a direct link to the audio recording in the structured translation sent to the Vaad.
- **Dashboard Playback**: Admins can listen to recordings directly from the ticket management dashboard.

## 3. Technical Constraints
- **Max Length**: 10 seconds.
- **Quality**: Medium (balanced for fast uploads).
- **Naming Protocol**: `{id}.webm` (matches the ticket ID).
- **Formatting**: `audio/webm;codecs=opus` for maximum efficiency and modern browser compatibility.

## 4. User Flow
1. **Resident Scans QR**: Capture image.
2. **Review Screen**: Hold the "Record Audio" button on the summary card.
3. **Preview**: Listen to the note or tap "Delete" to re-record.
4. **Send**: Ticket is created with image and optional audio.
5. **WhatsApp**: Vaad gets the message with both media links.

## 5. Security & Privacy
- Audio files are stored in GCP Storage and proxied via signed URLs.
- No personal data or resident profiles are linked to the recording.
