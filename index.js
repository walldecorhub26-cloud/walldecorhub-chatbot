const express = require("express");
const twilio = require("twilio");
const Groq = require("groq-sdk");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000
});

async function sendLeadEmail(customerMessage, aiReply, orderData) {
  try {
    console.log("Attempting to send email...");
    
    const orderSection = orderData && orderData.designCode ? `
      <hr/>
      <h2>🛒 Order Details</h2>
      <p><strong>Room Type:</strong> ${orderData.roomType || 'N/A'}</p>
      <p><strong>Design Code (PDF Page):</strong> ${orderData.designCode}</p>
      <p><strong>PDF File:</strong> ${orderData.pdfFile || 'N/A'}</p>
      <p><strong>Size:</strong> ${orderData.size || 'N/A'}</p>
      <p><strong>Price:</strong> ${orderData.price || 'N/A'}</p>
      <p><strong>Customer Name:</strong> ${orderData.customerName || 'N/A'}</p>
      <p><strong>City:</strong> ${orderData.city || 'N/A'}</p>
    ` : '';

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "waldecorhub26@gmail.com",
      subject: orderData && orderData.designCode ? `🛒 NEW ORDER - Design ${orderData.designCode}` : "New WallDecorHub AI Lead",
      html: `
        <h2>New Customer Inquiry</h2>
        <p><strong>Customer:</strong> ${customerMessage}</p>
        <p><strong>AI Reply:</strong> ${aiReply}</p>
        ${orderSection}
      `
    });

    console.log("Lead Email Sent Successfully");
  } catch (error) {
    console.error("Email Error:", error.message);
  }
}

// ── PDF Catalog Data ──
// Aap yahan apni PDF files ke baare mein info add kar sakte hain
const PDF_CATALOG = {
  "bedroom": {
    pdfName: "Bedroom Design",
    pdfFile: "bedroom-design.pdf",
    totalPages: 60,
    pdfUrl: "https://walldecorhub.com/Wallpaper-designs-pdf/bedroom-design.pdf",
    keywords: ["bedroom", "bed room", "kamra", "sone ka kamra", "master bedroom"]
  },
  "drawing": {
    pdfName: "Drawing Room",
    pdfFile: "408. Drawing Room Set.pdf",
    totalPages: 60,
    pdfUrl: "https://walldecorhub.com/Wallpaper-designs-pdf/408.%20Drawing%20Room%20Set.pdf",
    keywords: ["drawing room", "living room", "baithak", "lounge", "hall"]
  },
  "office": {
    pdfName: "Office Design",
    pdfFile: "office-design.pdf",
    totalPages: 60,
    pdfUrl: "https://walldecorhub.com/Wallpaper-designs-pdf/office-design.pdf",
    keywords: ["office", "daftar", "work", "corporate", "business"]
  },
  "gym": {
    pdfName: "Gym Wall Design",
    pdfFile: "gym-wall-design.pdf",
    totalPages: 60,
    pdfUrl: "https://walldecorhub.com/Wallpaper-designs-pdf/gym-wall-design.pdf",
    keywords: ["gym", "fitness", "exercise", "workout", "sport"]
  },
  "kids": {
    pdfName: "Kids Room Design",
    pdfFile: "kids-design.pdf",
    totalPages: 60,
    pdfUrl: "https://walldecorhub.com/Wallpaper-designs-pdf/kids-design.pdf",
    keywords: ["kids", "children", "baby", "bacche", "child room"]
  }
};

// ── Session store ──
const sessions = {};

function getSession(phone) {
  if (!sessions[phone]) {
    sessions[phone] = { 
      history: [], 
      orderData: {},
      step: "greeting" // greeting -> room_type -> style -> size -> designs_shown -> order_confirm
    };
  }
  return sessions[phone];
}

// ── AI Sales Agent System Prompt ──
const SYSTEM_PROMPT = `Tum WallDecorHub ke professional AI Sales Consultant ho — naam hai "Walli" 🎨

WallDecorHub ke baare mein:
- Pakistan ki premium wall decor company
- Panaflex wallpapers, 3D signage, office branding, gym walls banate hain
- Website: walldecorhub.com
- WhatsApp/Phone: 03041256202
- Location: Karachi, Pakistan
- Nationwide delivery available

PRICING — YE BILKUL FIX HAI, KABHHI COMPROMISE NAHI:
- Rate: Rs. 50 per square foot (fixed)
- Formula: Length (feet) × Height (feet) × 50 = Total Price
- Minimum order: Rs. 3,000
- Agar customer bargain kare to politely kehna: "Hamari pricing industry mein sabse competitive hai, quality aur service ke sath. Hum is rate par koi discount nahi de sakte."
- KABHI BHI rate kam ya zyada mat batao — sirf Rs. 50/sqft

DESIGN CATALOG — PDF SE DESIGNS:
Jab customer room type bataye, unhe PDF se designs dikhao. Pehle poochho:
1. Room type (bedroom/drawing room/office/gym/kids room)
2. Style preference (modern/classic/nature/abstract/Islamic)
3. Room ka size (length x height feet mein)

Phir PDF link share karo aur page numbers suggest karo based on style:
- Modern style: Pages 1-15
- Classic/Traditional: Pages 16-30  
- Nature/Floral: Pages 31-45
- Abstract/Bold: Pages 46-55
- Islamic/Geometric: Pages 56-60

Order confirm hone par:
- Customer se chosen page number poochho
- Size confirm karo
- Price calculate karo (L x H x 50)
- Ye details collect karo: Naam, City, Phone
- Kehna: "Aapka order note ho gaya! Hamari team 2-4 ghante mein confirm karey gi ✅"

PROFESSIONAL CONDUCT:
- Hamesha professional aur respectful rahein
- Business language use karein, slang nahi
- Customer ko "Aap" keh kar address karein
- Clear aur concise answers dein
- Ek baar mein sirf ek sawaal poochhein
- 3-4 lines se zyada mat likhein ek message mein

KABHI MAT KAREIN:
- Rate kam ya negotiate mat karein
- "Sasta" ya "cheap" words use mat karein
- "Haan dekh lete hain" type vague jawab mat dein
- Zyada casually baat mat karein`;

// ── AI Reply ──
async function getSalesReply(userMessage, session) {
  console.log("getSalesReply called with:", userMessage);
  
  session.history.push({ role: "user", content: userMessage });

  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }

  // Check if user is asking about designs / room type
  const msg = userMessage.toLowerCase();
  let catalogInfo = "";
  
  for (const [key, catalog] of Object.entries(PDF_CATALOG)) {
    if (catalog.keywords.some(kw => msg.includes(kw))) {
      catalogInfo = `\n\nCustomer ne ${catalog.pdfName} ke baare mein pucha hai. PDF link share karein: ${catalog.pdfUrl}\nTotal ${catalog.totalPages} designs available hain. Style ke hisab se page numbers suggest karein.`;
      session.orderData.roomType = catalog.pdfName;
      session.orderData.pdfFile = catalog.pdfFile;
      break;
    }
  }

  // Check if order being placed (page number mentioned)
  const pageMatch = userMessage.match(/page\s*(\d+)|(\d+)\s*page|design\s*(\d+)|(\d+)\s*number/i);
  if (pageMatch) {
    const pageNum = pageMatch[1] || pageMatch[2] || pageMatch[3] || pageMatch[4];
    session.orderData.designCode = `Page ${pageNum}`;
  }

  // Check size mentioned
  const sizeMatch = userMessage.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (sizeMatch) {
    const length = parseInt(sizeMatch[1]);
    const height = parseInt(sizeMatch[2]);
    const area = length * height;
    const price = Math.max(area * 50, 3000);
    session.orderData.size = `${length} x ${height} feet`;
    session.orderData.price = `Rs. ${price.toLocaleString()}`;
    session.orderData.area = area;
  }

  try {
    const systemWithCatalog = SYSTEM_PROMPT + catalogInfo;
    
    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemWithCatalog },
        ...session.history,
      ],
      model: "llama-3.3-70b-versatile",
      max_tokens: 300,
      temperature: 0.6,
    });

    const reply = response.choices[0].message.content;
    session.history.push({ role: "assistant", content: reply });

    return reply;
  } catch (error) {
    console.error("Groq API Error:", error.message);
    throw error;
  }
}

// ── Webhook (WhatsApp) ──
app.post("/webhook", async (req, res) => {
  const incomingMsg = (req.body.Body || "").trim();
  const from = req.body.From || "";

  console.log(`From: ${from} | Message: "${incomingMsg}"`);

  const session = getSession(from);
  let reply = "Assalam o Alaikum! Main Walli hoon, WallDecorHub ka AI Design Consultant. Aapki kya khidmat kar sakta hoon? 😊";

  try {
    reply = await getSalesReply(incomingMsg, session);
  } catch (err) {
    console.error("Error:", err.message);
    reply = "Maafi chahta hoon, abhi ek technical masla aa gaya. Seedha rabta karein: 03041256202";
  }

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);
  
  res.type("text/xml");
  res.send(twiml.toString());
});

// ── Chat API Endpoint ──
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message || "";
  
  if (!userMessage) {
    return res.json({ reply: "Please apna message likhein." });
  }

  const sessionId = req.body.sessionId || "web_user";
  const session = getSession(sessionId);

  try {
    const reply = await getSalesReply(userMessage, session);
    
    // Send email if order data collected
    if (session.orderData.designCode || session.orderData.size) {
      await sendLeadEmail(userMessage, reply, session.orderData);
    } else {
      await sendLeadEmail(userMessage, reply, null);
    }
    
    res.json({ reply, orderData: session.orderData });
  } catch (err) {
    console.error("Error:", err.message);
    res.json({ reply: "Maafi chahta hoon! Seedha rabta karein: 03041256202" });
  }
});

// ── Main Chat UI ──
app.get("/", (req, res) => {
  const catalogJson = JSON.stringify(PDF_CATALOG);
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Walli - WallDecorHub Design Consultant</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .chat-container {
      width: 100%;
      max-width: 520px;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      display: flex;
      flex-direction: column;
      height: 650px;
      overflow: hidden;
    }
    .chat-header {
      background: linear-gradient(135deg, #c8a96e 0%, #a07840 100%);
      color: white;
      padding: 18px 20px;
      text-align: center;
    }
    .chat-header h2 { font-size: 17px; font-weight: 700; }
    .chat-header p { font-size: 11px; opacity: 0.85; margin-top: 3px; }
    .quick-btns {
      padding: 10px 14px;
      background: #f8f6f2;
      border-bottom: 1px solid #e8e0d0;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .quick-btn {
      padding: 5px 10px;
      background: white;
      border: 1px solid #c8a96e;
      border-radius: 20px;
      font-size: 11px;
      cursor: pointer;
      color: #a07840;
      font-weight: 600;
      transition: all 0.2s;
    }
    .quick-btn:hover { background: #c8a96e; color: white; }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #faf9f7;
    }
    .message {
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.6;
      max-width: 85%;
      word-wrap: break-word;
    }
    .message.bot {
      background: white;
      color: #333;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      border-left: 3px solid #c8a96e;
    }
    .message.user {
      background: linear-gradient(135deg, #c8a96e, #a07840);
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .pdf-card {
      background: white;
      border: 1px solid #c8a96e;
      border-radius: 10px;
      padding: 10px 12px;
      margin-top: 6px;
      align-self: flex-start;
      max-width: 90%;
      box-shadow: 0 2px 8px rgba(200,169,110,0.2);
    }
    .pdf-card h4 { color: #a07840; font-size: 12px; margin-bottom: 6px; }
    .pdf-card a {
      display: inline-block;
      background: #c8a96e;
      color: white;
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 11px;
      text-decoration: none;
      font-weight: 600;
      margin-top: 4px;
    }
    .pdf-card a:hover { background: #a07840; }
    .pdf-card p { font-size: 11px; color: #666; margin-top: 4px; }
    .typing {
      display: flex;
      gap: 4px;
      align-self: flex-start;
      padding: 12px 14px;
      background: white;
      border-radius: 14px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    .typing span {
      width: 7px; height: 7px;
      background: #c8a96e;
      border-radius: 50%;
      animation: typing 1.4s infinite;
    }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
      30% { transform: translateY(-6px); opacity: 1; }
    }
    .chat-input-group {
      padding: 14px 16px;
      background: white;
      border-top: 1px solid #e8e0d0;
      display: flex;
      gap: 8px;
    }
    .chat-input {
      flex: 1;
      padding: 10px 14px;
      border: 1.5px solid #ddd;
      border-radius: 10px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
      font-family: 'Segoe UI', sans-serif;
    }
    .chat-input:focus { border-color: #c8a96e; }
    .send-btn {
      padding: 10px 18px;
      background: linear-gradient(135deg, #c8a96e, #a07840);
      color: white;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      font-size: 13px;
      transition: opacity 0.2s;
    }
    .send-btn:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="chat-container">
    <div class="chat-header">
      <h2>🎨 Walli — WallDecorHub Design Consultant</h2>
      <p>Professional Wall Decor Solutions • Rs. 50/sqft • Pakistan</p>
    </div>
    <div class="quick-btns">
      <button class="quick-btn" onclick="quickSend('Bedroom ke designs dikhain')">🛏️ Bedroom</button>
      <button class="quick-btn" onclick="quickSend('Drawing room designs chahiye')">🛋️ Drawing Room</button>
      <button class="quick-btn" onclick="quickSend('Office wall design')">💼 Office</button>
      <button class="quick-btn" onclick="quickSend('Gym wall design')">💪 Gym</button>
      <button class="quick-btn" onclick="quickSend('Price kya hai?')">💰 Pricing</button>
    </div>
    <div class="chat-messages" id="messages">
      <div class="message bot">
        Assalam o Alaikum! 👋 Main Walli hoon, WallDecorHub ka AI Design Consultant.<br><br>
        Aap kis jagah ke liye wall design chahte hain? Upar se apni category select karein ya message karein. 😊
      </div>
    </div>
    <div class="chat-input-group">
      <input type="text" class="chat-input" id="userInput" placeholder="Message likhein..." />
      <button class="send-btn" onclick="sendMessage()">Send ➤</button>
    </div>
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const userInput = document.getElementById('userInput');
    const sessionId = 'web_' + Date.now();
    const catalog = ${catalogJson};

    function quickSend(text) {
      userInput.value = text;
      sendMessage();
    }

    function addPdfCard(orderData) {
      if (!orderData || !orderData.pdfFile) return;
      
      // Find catalog entry
      let catalogEntry = null;
      for (const [key, val] of Object.entries(catalog)) {
        if (val.pdfFile === orderData.pdfFile) { catalogEntry = val; break; }
      }
      if (!catalogEntry) return;

      const card = document.createElement('div');
      card.className = 'pdf-card';
      card.innerHTML = \`
        <h4>📋 \${catalogEntry.pdfName} — Design Catalog</h4>
        <p>\${catalogEntry.totalPages} designs available • Apni pasand ka page number note kar ke batayein</p>
        <a href="\${catalogEntry.pdfUrl}" target="_blank">📄 Catalog Dekhein (PDF)</a>
      \`;
      messagesDiv.appendChild(card);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

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
          body: JSON.stringify({ message: text, sessionId: sessionId })
        });

        const data = await response.json();
        
        document.getElementById('typing')?.remove();

        const botMsg = document.createElement('div');
        botMsg.className = 'message bot';
        botMsg.innerHTML = (data.reply || 'Shukriya! Hamari team jald rabta karegi.').replace(/\n/g, '<br>');
        messagesDiv.appendChild(botMsg);

        // Show PDF card if room type detected
        if (data.orderData && data.orderData.pdfFile) {
          addPdfCard(data.orderData);
        }

        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      } catch (error) {
        document.getElementById('typing')?.remove();
        const botMsg = document.createElement('div');
        botMsg.className = 'message bot';
        botMsg.textContent = 'Maafi chahta hoon! Seedha rabta karein: 03041256202';
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
  console.log(`WallDecorHub Sales Agent running on port ${PORT}`);
});
