async function listModels() {
  const apiKey = "AIzaSyAMrJkjqVpPV-ngJT5E9HC667o5-SYYy2g";
  try {
    console.log("Fetching models...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
        console.error("Failed to fetch:", response.status, response.statusText);
        const text = await response.text();
        console.error("Details:", text);
        return;
    }
    
    const data = await response.json();
    console.log("Models supporting generateContent:");
    data.models.forEach(m => {
        if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")) {
            console.log(`- ${m.name}`);
        }
    });

  } catch (err) {
    console.error("Error:", err);
  }
}

listModels();
