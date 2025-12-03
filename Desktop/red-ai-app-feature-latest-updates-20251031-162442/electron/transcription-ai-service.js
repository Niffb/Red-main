class TranscriptionAIService {
  constructor() {
    // Use same SDK and model as workflow executor
    this.model = 'gemini-2.0-flash-exp';
  }

  async generateWorkflowSuggestion(transcriptionText, userGoal) {
    // Get API key at runtime to ensure dotenv has loaded
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY not found in environment variables');
      throw new Error('GEMINI_API_KEY not configured. Please check your .env file');
    }
    
    console.log('✅ Using Gemini API key:', apiKey.substring(0, 10) + '...');

    const prompt = `You are an AI workflow assistant. Create a simple, actionable workflow based on this transcription and goal.

TRANSCRIPTION: ${transcriptionText}

GOAL: ${userGoal}

Create a workflow with 3-4 short, practical steps. Keep descriptions brief (1-2 sentences max).

Return ONLY valid JSON in this exact format (no extra text):
{
  "workflowTitle": "Brief title (max 6 words)",
  "summary": "One sentence summary",
  "steps": [
    {
      "title": "Step 1 title (max 5 words)",
      "description": "One sentence action",
      "estimatedTime": "5 minutes"
    }
  ],
  "relevantContext": ["Key insight 1", "Key insight 2"]
}`;

    console.log('🔗 Calling Gemini API with SDK...');
    
    // Use the same SDK as workflow executor
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: this.model });
      
      const result = await geminiModel.generateContent(prompt);
      const response = result.response;
      const textResponse = response.text();
      
      console.log('✅ Gemini API response received');
      console.log('📝 Raw AI response length:', textResponse.length, 'chars');
      
      let workflow;
      
      // Try to parse as JSON
      try {
        // First, try to parse the entire response as JSON
        workflow = JSON.parse(textResponse);
        console.log('✅ Parsed JSON directly');
      } catch (directParseError) {
        console.log('⚠️ Direct JSON parse failed, extracting from markdown...');
        
        // Extract JSON from markdown code blocks or find raw JSON
        let jsonMatch = null;
        
        const codeBlockMatch = textResponse.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
        if (codeBlockMatch) {
          jsonMatch = codeBlockMatch[1].trim();
        } else {
          const firstBrace = textResponse.indexOf('{');
          const lastBrace = textResponse.lastIndexOf('}');

          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonMatch = textResponse.substring(firstBrace, lastBrace + 1);
          } else {
            throw new Error('Invalid AI response format - no JSON found');
          }
        }
        
        workflow = JSON.parse(jsonMatch);
        console.log('✅ Successfully parsed extracted JSON');
    }

      // Transform to expected UI format
      const formattedWorkflow = {
        title: workflow.workflowTitle || 'Your Workflow',
        description: workflow.summary || '',
        steps: workflow.steps.map((step, index) => ({
          title: step.title,
          description: step.description,
          details: step.estimatedTime ? [`Estimated time: ${step.estimatedTime}`] : []
        })),
        notes: workflow.relevantContext ? workflow.relevantContext.join(' • ') : ''
      };
      
      console.log('✅ Workflow formatted:', formattedWorkflow.steps.length, 'steps');
      return formattedWorkflow;
    } catch (error) {
      console.error('❌ Error calling Gemini API:', error);
      throw new Error('Failed to generate workflow: ' + error.message);
    }
  }
}

module.exports = new TranscriptionAIService();
