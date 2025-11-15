const fetch = require('node-fetch');

class TranscriptionAIService {
  constructor() {
    // Use gemini-2.5-flash (latest, available in v1 API)
    this.model = 'gemini-2.5-flash';
  }

  async generateWorkflowSuggestion(transcriptionText, userGoal) {
    // Get API key at runtime to ensure dotenv has loaded
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY not found in environment variables');
      throw new Error('GEMINI_API_KEY not configured. Please check your .env file');
    }
    
    console.log('✅ Using Gemini API key:', apiKey.substring(0, 10) + '...');

    const prompt = `You are an AI workflow assistant. A user has transcribed the following content and wants to achieve a specific goal.

TRANSCRIPTION:
${transcriptionText}

USER'S GOAL:
${userGoal}

Based on the transcription content and the user's goal, suggest a practical workflow with 2-5 actionable steps. Each step should be specific, measurable, and directly related to achieving the goal using insights from the transcription.

Respond in JSON format:
{
  "workflowTitle": "Brief workflow title",
  "summary": "2-3 sentence explanation of how this workflow helps achieve the goal",
  "steps": [
    {
      "title": "Step title",
      "description": "Detailed action to take",
      "estimatedTime": "e.g., 10 minutes"
    }
  ],
  "relevantContext": ["Key insight 1 from transcription", "Key insight 2"]
}`;

    const endpoint = `https://generativelanguage.googleapis.com/v1/models/${this.model}:generateContent?key=${apiKey}`;
    console.log('🔗 Calling Gemini API:', endpoint.replace(apiKey, 'API_KEY_HIDDEN'));
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Gemini API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`Gemini API error (${response.status}): ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Gemini API response received');
    
    if (!data.candidates || !data.candidates[0]) {
      console.error('❌ No candidates in response:', data);
      throw new Error('No workflow suggestions generated');
    }
    
    const textResponse = data.candidates[0].content.parts[0].text;
    console.log('📝 Raw AI response:', textResponse.substring(0, 200) + '...');
    
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ No JSON found in response');
      throw new Error('Invalid AI response format');
    }
    
    const workflow = JSON.parse(jsonMatch[0]);
    
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
  }
}

module.exports = new TranscriptionAIService();

