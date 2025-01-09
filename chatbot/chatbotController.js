const { GoogleGenerativeAI } = require("@google/generative-ai");

const api_gemini = process.env.API_GEMINI;

const genAI = new GoogleGenerativeAI();
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const prompt = "Explain how AI works";


/*
Initialation Format

req: {}

*/
const initChatbot = (req, res) => {

} 

const result = await model.generateContent(prompt);
console.log(result.response.text());