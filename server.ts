import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize Gemini AI client lazily
  let aiClient: GoogleGenAI | null = null;
  const getAi = () => {
    if (!aiClient && process.env.GEMINI_API_KEY) {
      aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return aiClient;
  };

  // API 1: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });


  // API: IBKR Config
  app.get('/api/ibkr/config', (req, res) => {
    const token = process.env.IBKR_FLEX_TOKEN;
    const queryId = process.env.IBKR_FLEX_QUERY_ID;
    
    if (token) {
      res.json({
        isConfigured: true,
        tokenLast4: token.substring(token.length - 4),
        queryId: queryId || '',
      });
    } else {
      res.json({
        isConfigured: false,
        tokenLast4: '',
        queryId: '',
      });
    }
  });

  // API 2: IBKR Flex Web Service Sync Proxy
  app.post('/api/ibkr/flex-sync', async (req, res) => {
    const { startDate, endDate } = req.body;
    const token = process.env.IBKR_FLEX_TOKEN || req.body.token; // fallback if needed, but prefer env
    const queryId = process.env.IBKR_FLEX_QUERY_ID || req.body.queryId;

    if (!token || !queryId) {
      return res.status(400).json({
        success: false,
        errorMessage: 'IBKR Flex Token and Query ID are required. Please configure them in settings.',
      });
    }

    try {
      // Step 1: SendRequest
      let sendRequestUrl = `https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=${encodeURIComponent(
        token
      )}&q=${encodeURIComponent(queryId)}&v=3`;

      if (startDate && endDate) {
        sendRequestUrl += `&fd=${startDate}&td=${endDate}`;
      }

      const sendRes = await fetch(sendRequestUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'CanadianACB/1.0 Node/22.0 (TaxEngine)',
        },
      });

      const sendXml = await sendRes.text();

      // Check if SendRequest failed
      if (sendXml.includes('<Status>Fail</Status>') || sendXml.includes('<Status>Error</Status>')) {
        const errCodeMatch = sendXml.match(/<ErrorCode>(\d+)<\/ErrorCode>/);
        const errMsgMatch = sendXml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
        const errorCode = errCodeMatch ? errCodeMatch[1] : 'UNKNOWN';
        const errorMessage = errMsgMatch ? errMsgMatch[1] : 'IBKR Flex Web Service request failed';

        let userAdvice = errorMessage;
        if (errorCode === '1012') userAdvice = 'Token has expired. Please generate a new Flex Token in IBKR Client Portal.';
        else if (errorCode === '1015') userAdvice = 'Invalid token or Query ID. Please verify your Flex Web Service configuration.';
        else if (errorCode === '1018') userAdvice = 'Date range exceeded 365 days or data older than retention period.';

        return res.status(400).json({
          success: false,
          errorCode,
          errorMessage: userAdvice,
        });
      }

      const refCodeMatch = sendXml.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/);
      if (!refCodeMatch) {
        return res.status(500).json({
          success: false,
          errorMessage: 'IBKR did not return a valid ReferenceCode in response.',
        });
      }

      const referenceCode = refCodeMatch[1];

      // Step 2: Poll GetStatement with exponential backoff (2s, 4s, 8s, 15s)
      const getStatementUrl = `https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement?t=${encodeURIComponent(
        token
      )}&q=${encodeURIComponent(referenceCode)}&v=3`;

      let statementXml = '';
      let attempts = 0;
      const maxAttempts = 6;
      const delays = [2000, 3000, 5000, 8000, 10000, 15000];

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempts] || 5000));
        attempts++;

        const getRes = await fetch(getStatementUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'CanadianACB/1.0 Node/22.0 (TaxEngine)',
          },
        });

        const text = await getRes.text();
        if (text.includes('<FlexQueryResponse') || text.includes('<FlexStatements')) {
          statementXml = text;
          break;
        }

        if (text.includes('<Status>Fail</Status>') && !text.includes('Statement is not ready')) {
          const errCodeMatch = text.match(/<ErrorCode>(\d+)<\/ErrorCode>/);
          const errMsgMatch = text.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
          return res.status(400).json({
            success: false,
            errorCode: errCodeMatch ? errCodeMatch[1] : 'POLL_ERROR',
            errorMessage: errMsgMatch ? errMsgMatch[1] : 'Statement generation error on IBKR.',
          });
        }
      }

      if (!statementXml) {
        return res.status(504).json({
          success: false,
          errorMessage: 'IBKR Flex Statement took longer than expected to generate. Please retry in a few moments.',
        });
      }

      return res.json({
        success: true,
        referenceCode,
        statementXml,
      });
    } catch (error: any) {
      console.error('Flex Web Service proxy error:', error);
      return res.status(500).json({
        success: false,
        errorMessage: error.message || 'Internal server error while communicating with IBKR Flex Web Service.',
      });
    }
  });

  // API 3: Bank of Canada FX live proxy
  app.get('/api/fx/boc', async (req, res) => {
    const { series = 'FXUSDCAD', startDate, endDate } = req.query;
    try {
      let url = `https://www.bankofcanada.ca/valet/observations/${series}/json`;
      if (startDate && endDate) {
        url += `?start_date=${startDate}&end_date=${endDate}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Bank of Canada API returned error' });
      }
      const data = await response.json();
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // API 4: AI Tax Assistant for Corporate Action classification & CRA Explanation
  app.post('/api/ai-explain', async (req, res) => {
    const { brokerText, securitySymbol, cashAmount, newShares, transactionDate } = req.body;
    try {
      const ai = getAi();
      if (!ai) {
        return res.json({
          explanation:
            'AI Assistant unavailable (No GEMINI_API_KEY configured). Standard Canadian tax rules apply: ITA s. 85.1 for Canadian share rollovers, s. 40(1) for taxable dispositions, s. 84 for deemed dividends.',
          statutoryReference: 'ITA ss. 40, 47, 85.1',
        });
      }

      const prompt = `You are an expert Canadian tax practitioner specializing in the Income Tax Act (Canada) and CRA administrative practice for capital gains and Adjusted Cost Base (ACB).
Evaluate the following corporate action:
Security: ${securitySymbol || 'Unknown'}
Date: ${transactionDate || 'Unknown'}
Broker Text: "${brokerText || ''}"
Cash Component: ${cashAmount || 0}
New Shares: ${newShares || 0}

Explain:
1. What the probable corporate action is (e.g. cash takeover, share-for-share, mixed consideration, stock dividend, return of capital, spin-off).
2. The relevant Canadian Income Tax Act sections (e.g. s. 47, s. 85.1, s. 86, s. 86.1, s. 84(2), s. 53(2)(a), s. 40(1)).
3. How the taxpayer should classify the cash (capital boot vs deemed dividend vs return of capital) and the resulting ACB calculation formula.
Keep your answer clear, concise, objective, and reference the specific CRA tax rules without marketing fluff. Include the required disclaimer that this is educational guidance and not official CPA advice.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return res.json({
        explanation: response.text,
        statutoryReference: 'ITA ss. 40, 47, 84, 85.1, 86, 86.1, 87',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Canadian ACB Calculator server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
