import imageCompression from 'browser-image-compression';

export const compressImage = async (file: File): Promise<File> => {
  const options = {
    maxSizeMB: 0.8, // Target size under 1MB
    maxWidthOrHeight: 1280, // Good enough for Gemini analysis
    useWebWorker: true,
  };

  try {
    const compressedFile = await imageCompression(file, options);
    console.log(`Original: ${file.size / 1024} KB`);
    console.log(`Compressed: ${compressedFile.size / 1024} KB`);
    return compressedFile;
  } catch (error) {
    console.error('Compression failed:', error);
    return file; // Fallback to original
  }
};
