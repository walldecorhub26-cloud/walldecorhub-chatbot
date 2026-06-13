const express = require("express");
const twilio = require("twilio");
const Groq = require("groq-sdk");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendLeadEmail(customerMessage, aiReply) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "waldecorhub26@gmail.com",
      subject: "New WallDecorHub AI Lead",
      html: `
        <h2>New Customer Inquiry</h2>
        <p><strong>Customer:</strong> ${customerMessage}</p>
        <p><strong>AI Reply:</strong> ${aiReply}</p>
      `
    });

    console.log("Lead Email Sent");
  } catch (error) {
    console.error("Email Error:", error.message);
  }
}

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
  console.log("🤖 getSalesReply called with:", userMessage);
  
  session.history.push({ role: "user", content: userMessage });

  // Keep last 20 messages only
  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }

  try {
    console.log("📡 Calling Groq API...");
    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...session.history,
      ],
      model: "llama-3.3-70b-versatile",
      max_tokens: 300,
      temperature: 0.7,
    });

    console.log("✅ Groq response received");
    const reply = response.choices[0].message.content;
    console.log("💬 Reply generated:", reply);
    
    session.history.push({ role: "assistant", content: reply });

    return reply;
  } catch (error) {
    console.error("❌ Groq API Error:", error.message);
    throw error;
  }
}

// ── Webhook ──
app.post("/webhook", async (req, res) => {
  const incomingMsg = (req.body.Body || "").trim();
  const from = req.body.From || "";

  console.log(`📩 From: ${from} | Message: "${incomingMsg}"`);

  const session = getSession(from);
  let reply = "Assalam o alaikum! Main Walli hoon. Kya mein aapki madad kar sakta hoon? 😊";

  try {
    reply = await getSalesReply(incomingMsg, session);
    console.log(`✅ Final reply to send: ${reply}`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    reply = `Maafi chahta hoon! Seedha contact: 03041256202`;
  }

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);
  
  const xmlResponse = twiml.toString();
  console.log(`📤 Sending XML response: ${xmlResponse}`);
  
  res.type("text/xml");
  res.send(xmlResponse);
});

// ── Chat API Endpoint ──
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message || "";
  
  if (!userMessage) {
    return res.json({ reply: "Message likhen!" });
  }

  const from = "web_user";
  const session = getSession(from);

  try {
    const reply = await getSalesReply(userMessage, session);
    res.json({ reply });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.json({ reply: "Maafi chahta hoon! Seedha contact: 03041256202" });
  }
});

// ── Health check with UI ──
app.get("/", (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Walli - WallDecorHub AI Agent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .chat-container {
      width: 100%;
      max-width: 500px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
      height: 600px;
      overflow: hidden;
    }
    .chat-header {
      background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
      color: white;
      padding: 20px;
      text-align: center;
      font-weight: 700;
      font-size: 18px;
    }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f8f9fa;
    }
    .message {
      padding: 12px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
      max-width: 85%;
      word-wrap: break-word;
    }
    .message.bot {
      background: #e8f5e9;
      color: #1b5e20;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .message.user {
      background: #25D366;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .typing {
      display: flex;
      gap: 4px;
      align-self: flex-start;
      padding: 12px 14px;
    }
    .typing span {
      width: 8px;
      height: 8px;
      background: #999;
      border-radius: 50%;
      animation: typing 1.4s infinite;
    }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.7; }
      30% { transform: translateY(-8px); opacity: 1; }
    }
    .chat-input-group {
      padding: 16px;
      background: white;
      border-top: 1px solid #ddd;
      display: flex;
      gap: 10px;
    }
    .chat-input {
      flex: 1;
      padding: 10px 14px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    .chat-input:focus {
      border-color: #25D366;
    }
    .send-btn {
      padding: 10px 20px;
      background: #25D366;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: background 0.2s;
    }
    .send-btn:hover {
      background: #128C7E;
    }
  </style>
</head>
<body>
  <div class="chat-container">
    <div class="chat-header">🎨 Walli - WallDecorHub AI Agent</div>
    <div class="chat-messages" id="messages">
      <div class="message bot">
        👋 Assalam o alaikum! Main Walli hoon, WallDecorHub ka AI Design Expert! Aapke liye mein kaunsi design service suggest kar sakta hoon?
      </div>
    </div>
    <div class="chat-input-group">
      <input type="text" class="chat-input" id="userInput" placeholder="Message likhen..." />
      <button class="send-btn" onclick="sendMessage()">Send</button>
    </div>
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const userInput = document.getElementById('userInput');

    async function sendMessage() {
      const text = userInput.value.trim();
      if (!text) return;

      const userMsg = document.createElement('div');
      userMsg.className = 'message user';
      userMsg.textContent = text;
      messagesDiv.appendChild(userMsg);
      userInput.value = '';
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      const typingDiv = document.createElement('div');
      typingDiv.className = 'typing';
      typingDiv.id = 'typing';
      typingDiv.innerHTML = '<span></span><span></span><span></span>';
      messagesDiv.appendChild(typingDiv);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      try {
        const response = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });

        const data = await response.json();
        
        if (typingDiv) typingDiv.remove();

        const botMsg = document.createElement('div');
        botMsg.className = 'message bot';
        botMsg.textContent = data.reply || 'Shukriya! Team shortly reply karega.';
        messagesDiv.appendChild(botMsg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      } catch (error) {
        if (typingDiv) typingDiv.remove();
        const botMsg = document.createElement('div');
        botMsg.className = 'message bot';
        botMsg.textContent = 'Maafi chahta hoon! Seedha contact: 03041256202';
        messagesDiv.appendChild(botMsg);
      }
    }

    userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>
  `;
  res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WallDecorHub Sales Agent running on port ${PORT}`);
});
