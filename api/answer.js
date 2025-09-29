import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { transcript, imageUrl } = req.body;
    let messages;

    if (imageUrl) {
      console.log("\n[Backend] Received request with image URL:", imageUrl);
      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "What’s in this image?" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ];
    } else {
      console.log("\n[Backend] Received request with transcript:", transcript);
      messages = [{ role: "user", content: transcript }];
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 300,
      })
    });

    const data = await response.json();
    res.status(200).json({ answer: data.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "LLM request failed" });
  }
}
