<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Model Router with Budgets: Getting Started Guide

Welcome to the **Model Router with Budgets** gateway! This application acts as an intelligent API routing gateway. It analyzes incoming prompts, determines their complexity, and routes them to either an efficient, cost-effective Large Language Model (Gemini 1.5 Flash) or a highly capable, reasoning model (Gemini 1.5 Pro). 

Crucially, it is governed by a **Global Budget System** that tracks your spending in real-time, downgrading models or suspending traffic entirely to prevent surprise bills.

---

## 🛠️ 1. Prerequisites

Before starting, ensure you have the following installed and configured:

1. **Node.js** (v18 or higher recommended)
2. **Google Gemini API Key:** You can generate one from [Google AI Studio](https://aistudio.google.com/).
3. **Firebase Project:** You must have a Firebase project with **Firestore Database** enabled.

---

## ⚙️ 2. Configuration & Setup

### A. Environment Variables
1. Create a file named `.env` in the root of the project (if it doesn't already exist).
2. Add your Gemini API key to it:
   ```env
   GEMINI_API_KEY="your_google_gemini_api_key_here"
   ```

### B. Firebase Configuration
The application stores logs and the global budget configuration in Firestore.
1. Open the file `firebase-applet-config.json` in the root directory.
2. Replace its contents with your actual Firebase project configuration:
   ```json
   {
     "apiKey": "YOUR_FIREBASE_API_KEY",
     "authDomain": "YOUR_PROJECT_ID.firebaseapp.com",
     "projectId": "YOUR_PROJECT_ID",
     "storageBucket": "YOUR_PROJECT_ID.appspot.com",
     "messagingSenderId": "YOUR_SENDER_ID",
     "appId": "YOUR_APP_ID"
   }
   ```
*(Note: If you already have a working Firebase setup configured in the repo, you can skip this step!)*

---

## 🚀 3. Running the Application

Once your configuration is complete, you can start the application:

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start the Development Server:**
   ```bash
   npm run dev
   ```

3. **Access the Application:**
   Open your browser and navigate to `http://localhost:3000`.

---

## 📖 4. How to Use the Gateway

The interface is divided into three main sections:

### 01 / Overview (Dashboard)
This is your financial and operational command center.
- **Financial Oversight:** View your current expenditure against your global monthly limit. 
- **Efficiency Heatmap:** A visual representation of your recent queries. Queries routed to the **Expert Tier (Black)** indicate high difficulty, while those sent to the **Efficient Tier (Orange)** indicate lower complexity.
- **Endpoint Distribution:** See the exact percentage breakdown of which models are handling your traffic.

### 02 / Playground (Interaction Portal)
This is where you test the routing intelligence. 
1. Enter a prompt into the text area.
2. Click **Execute Route**.
3. **Observe the Results:** Once the response loads, look at the metadata presented:
   - **Selected Terminal:** Shows whether `gemini-1.5-flash` or `gemini-1.5-pro` handled the request.
   - **Estimated Difficulty:** The complexity score (0% to 100%) assigned by the estimator.
   - **Cost Weight:** The precise token-based cost of that specific API call.

### 03 / Archive (Logs)
A historical table showing every request that has passed through the gateway, along with its precise execution time, chosen model, and unit cost.

---

## 🧠 5. Understanding the Logic (Under the Hood)

### How is difficulty determined?
When you submit a prompt, the Express server (`server.ts`) performs a rapid analysis:
1. It applies **heuristics** (checking length, checking for keywords like "code", "explain", "reasoning").
2. It sends the prompt to the ultra-fast `Flash` model to perform an **LLM-based classification** (scoring the prompt from 0.0 to 1.0).
3. It combines these two scores. If the final difficulty is **> 0.6**, it routes to the Expert Tier. Otherwise, it routes to the Efficient Tier.

### How does the Budget Enforcer work?
- The gateway reads your current usage directly from Firestore using atomic transactions (`increment`).
- **The 90% Rule:** If your current spending reaches >90% of your total budget limit, the router enters **Aggressive Frugality** mode. Even if a prompt is highly complex, it will be forcefully routed to the cheaper model to save money.
- **The 100% Rule:** If the budget is exhausted, the router issues a `402 Payment Required` block and refuses to process further prompts until the budget is increased or reset.

---

## 🧪 6. Simulating a Budget Alert

To see the system's defensive capabilities in action:
1. Open your Firebase Firestore console.
2. Navigate to the `config` collection, then the `global` document.
3. Manually lower the `monthlyBudget` field to exactly match or drop slightly below your `totalSpend`.
4. Go back to the App's Playground and send a prompt. 
5. You will see the system gracefully reject the request, demonstrating that your costs are strictly capped!
