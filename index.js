const express = require("express");
const twilio = require("twilio");
const Groq = require("groq-sdk");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Session store (conversation history per customer) ──
const sessions = {};

function getSession(phone) {
  if (!sessions[phone]) {
    sessions[phone] = { history: [], orderData: {} };
  }
  return sessions[phone];
}

// ── AI Sales Agent System Prompt ──
const SYSTEM_PROMPT = `Tum WallDecorHub ke expert AI Sales Agent ho — naam hai "Walli" 🎨

WallDecorHub ke baare mein:
- Pakistan ki premium wall decor company
- Panaflex wallpapers, 3D signage, office branding, gym walls banate hain
- Website: walldecorhub.com
- WhatsApp/Phone: 03041256202
- Location: Karachi, Pakistan
- Nationwide delivery available

Products aur Prices:
1. Home Wall Decor (Bedroom, Living Room, Kids Room) — Rs. 6,500 se shuru
2. Retail & Shop Interiors (custom branding) — quote pe
3. Office Wall Branding (logo murals, reception) — quote pe
4. Gym & Fitness Wall (athlete graphics, motivational) — quote pe
5. 3D Signage & Lettering (LED, acrylic, metal) — quote pe
6. Design Studio (custom design service) — quote pe

Tumhara kaam — Inquiry se Order tak:
1. Customer ka warmly swagat karo
2. Unka naam poochho
3. Samjho — kya chahiye, kis jagah ke liye
4. Relevant products suggest karo
5. Size poochho (length x height feet mein)
6. Design preference poochho (ya khud suggest karo)
7. City poochho delivery ke liye
8. Quote/price estimate do
9. Order confirm karo ya boss ko refer karo: 03041256202
10. Follow up karo — "Kya aur koi sawaal hai?"

Personality:
- Friendly, warm, professional
- Roman Urdu mein baat karo (jaise customer kare)
- Chhote chhote messages bhejo — WhatsApp ke liye
- Emojis use karo — magar zyada nahi
- Customer ko excited feel karao apni wall dekh ke
- Kabhi bhi "main sirf AI hoon" mat kaho — sales agent ki tarah behave karo
- Agar koi cheez nahi pata to: "Main abhi confirm kar ke batata hoon, ek second!"

Important:
- Ek baar mein ek hi sawaal poochho
- Short replies — 3-4 lines max
- Har message ke end mein agle step ki taraf le jao
- Order ke liye details lene ke baad: "Shukriya! Hum 2-4 ghante mein aapko quote bhejenge ✅"`;

// ── AI Reply (Groq - Free & Fast) ──
async function getSalesReply(userMessage, session) {
  session.history.push({ role: "user", content: userMessage });

  // Keep last 20 messages only
  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }

  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...session.history,
    ],
    model: "llama-3.1-70b-versatile",
    max_tokens: 300,
    temperature: 0.7,
  });

  const reply = response.choices[0].message.content;
  session.history.push({ role: "assistant", content: reply });

  return reply;
}

// ── Webhook ──
app.post("/webhook", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const incomingMsg = (req.body.Body || "").trim();
  const from = req.body.From || "";

  console.log(`📩 From: ${from} | Message: "${incomingMsg}"`);

  const session = getSession(from);
  let reply = "";

  try {
    reply = await getSalesReply(incomingMsg, session);
  } catch (err) {
    console.error("❌ Error:", err.message);
    reply = `Maafi chahta hoon, thodi technical dikkat aa gayi! 😅\nSeedha contact karein:\n📞 *03041256202*`;
  }

  twiml.message(reply);
  res.type("text/xml");
  res.send(twiml.toString());
});

// ── Health check ──
app.get("/", (req, res) => {
  res.send("✅ WallDecorHub AI Sales Agent is running! 🎨");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WallDecorHub Sales Agent running on port ${PORT}`);
});
