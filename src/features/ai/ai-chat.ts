/**
 * AI Agent Chat — Conversational AI assistant for admins
 */

import { functions, httpsCallable } from '../../firebase';
import { sanitizeHTML } from '../../ui';

export function setupAIAgentChat(): void {
  const chatInput = document.getElementById('ai-agent-input') as HTMLInputElement;
  const sendBtn = document.getElementById('ai-agent-send-btn') as HTMLButtonElement;
  const messagesContainer = document.getElementById('ai-agent-messages');
  const clearChatBtn = document.getElementById('clear-chat-btn');

  let conversationHistory: Array<{ user: string; assistant: string }> = [];

  if (!chatInput || !sendBtn || !messagesContainer) return;

  const sendMessage = async (): Promise<void> => {
    const message = chatInput.value.trim();
    if (!message) return;

    chatInput.disabled = true;
    sendBtn.disabled = true;
    addMessageToChat('user', message);
    chatInput.value = '';
    const typingId = addTypingIndicator();

    try {
      const aiAgentChat = httpsCallable(functions, 'aiAgentChat');
      const result = await aiAgentChat({ message, conversationHistory });
      const data = result.data as any;
      removeTypingIndicator(typingId);
      addMessageToChat('assistant', data.response);
      conversationHistory.push({ user: message, assistant: data.response });
      if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);
    } catch (error: any) {
      removeTypingIndicator(typingId);
      addMessageToChat('assistant', `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`);
    } finally {
      chatInput.disabled = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  };

  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatMarkdown(text: string): string {
    let html = text.trim();
    const hasHtmlTags = /<\/?(?:ul|ol|li|p|div|h[1-6]|strong|em|b|i|code|pre|blockquote|br|hr|span|a)[>\s]/i.test(html);

    if (hasHtmlTags) {
      html = html.replace(/<ul([^>]*)>/gi, '<ul class="space-y-2 my-4"$1>');
      html = html.replace(/<ol([^>]*)>/gi, '<ol class="space-y-2 my-4 list-decimal list-inside"$1>');
      html = html.replace(/<li([^>]*)>/gi, '<li class="flex items-start gap-3 text-dark-200 mb-2"$1><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span>');
      html = html.replace(/<\/li>/gi, '</span></li>');
      html = html.replace(/<strong([^>]*)>/gi, '<strong class="text-white font-semibold"$1>');
      html = html.replace(/<b([^>]*)>/gi, '<strong class="text-white font-semibold"$1>');
      html = html.replace(/<\/b>/gi, '</strong>');
      html = html.replace(/<em([^>]*)>/gi, '<em class="text-primary-300"$1>');
      html = html.replace(/<h1([^>]*)>/gi, '<h1 class="text-2xl font-bold text-white mt-4 mb-3"$1>');
      html = html.replace(/<h2([^>]*)>/gi, '<h2 class="text-xl font-bold text-white mt-4 mb-2"$1>');
      html = html.replace(/<h3([^>]*)>/gi, '<h3 class="text-lg font-bold text-white mt-3 mb-2"$1>');
      html = html.replace(/<p([^>]*)>/gi, '<p class="mb-3 text-dark-200 leading-relaxed"$1>');
      html = html.replace(/<code([^>]*)>/gi, '<code class="px-2 py-0.5 bg-dark-800 rounded text-accent-400 text-sm font-mono"$1>');
      html = html.replace(/<pre([^>]*)>/gi, '<pre class="bg-dark-900/80 rounded-xl p-4 my-3 overflow-x-auto border border-dark-700"$1>');
      html = html.replace(/<blockquote([^>]*)>/gi, '<blockquote class="border-l-4 border-primary-500 pl-4 py-2 my-3 bg-primary-500/5 rounded-r-lg italic text-dark-300"$1>');
      html = html.replace(/>\s*\n+\s*</g, '> <');
      html = html.replace(/>([^<]+)</g, (_match, content) => {
        let styled = content.replace(/(\d+(?:\.\d+)?%)/g, '<span class="text-accent-400 font-semibold">$1</span>');
        styled = styled.replace(/(\d+\/\d+)/g, '<span class="text-primary-400 font-medium">$1</span>');
        return `>${styled}<`;
      });
      return html;
    }

    // Markdown to HTML
    html = html.replace(/^### (.+)$/gm, '<h4 class="text-lg font-bold text-white mt-4 mb-2 flex items-center gap-2"><span class="w-1.5 h-1.5 bg-accent-400 rounded-full"></span>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="text-xl font-bold text-white mt-5 mb-3 pb-2 border-b border-primary-500/20">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="text-2xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent mt-4 mb-3">$1</h2>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong class="text-white font-semibold">$1</strong>');
    html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre class="bg-dark-900/80 rounded-xl p-4 my-3 overflow-x-auto border border-dark-700"><code class="text-accent-300 text-sm font-mono">$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code class="px-2 py-0.5 bg-dark-800 rounded text-accent-400 text-sm font-mono">$1</code>');
    html = html.replace(/^\* (.+)$/gm, '<div class="flex items-start gap-3 mb-2"><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span class="text-dark-200">$1</span></div>');
    html = html.replace(/^- (.+)$/gm, '<div class="flex items-start gap-3 mb-2"><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span class="text-dark-200">$1</span></div>');
    html = html.replace(/^(\d+)\. (.+)$/gm, (_m, num, content) => `<div class="flex items-start gap-3 mb-2"><span class="w-6 h-6 bg-gradient-to-br from-primary-500/20 to-accent-500/20 rounded-lg flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">${num}</span><span class="text-dark-200">${content}</span></div>`);
    html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-primary-500 pl-4 py-2 my-3 bg-primary-500/5 rounded-r-lg italic text-dark-300">$1</blockquote>');
    html = html.replace(/^---$/gm, '<hr class="my-4 border-dark-700">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary-400 hover:text-primary-300 underline" target="_blank">$1</a>');
    html = html.replace(/(\d+(?:\.\d+)?%)/g, '<span class="text-accent-400 font-semibold">$1</span>');
    html = html.replace(/(\d+\/\d+)(?!<)/g, '<span class="text-primary-400 font-medium">$1</span>');
    html = html.replace(/\n\n+/g, '</p><p class="mb-3 text-dark-200 leading-relaxed">');
    html = html.replace(/\n/g, '<br>');
    html = `<p class="mb-3 text-dark-200 leading-relaxed">${html}</p>`;
    html = html.replace(/<p class="[^"]*">(<(?:h[1-6]|div|ul|ol|pre|blockquote)[^>]*>)/g, '$1');
    html = html.replace(/(<\/(?:h[1-6]|div|ul|ol|pre|blockquote)>)<\/p>/g, '$1');
    html = html.replace(/<p class="[^"]*"><\/p>/g, '');
    html = html.replace(/<p class="[^"]*"><br><\/p>/g, '');
    html = html.replace(/<br><br>/g, '</p><p class="mb-3 text-dark-200 leading-relaxed">');
    return html;
  }

  function addMessageToChat(role: 'user' | 'assistant', content: string): void {
    if (!messagesContainer) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex items-start gap-4 ai-chat-message ${role}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formattedContent = role === 'user' ? escapeHtml(content) : formatMarkdown(content);

    if (role === 'user') {
      messageDiv.innerHTML = `<div class="flex-1 flex justify-end"><div class="max-w-[85%]"><div class="rounded-2xl rounded-tr-sm p-4 bg-gradient-to-br from-primary-500/20 to-accent-500/10 border border-primary-500/30 shadow-lg shadow-primary-500/10"><p class="text-white whitespace-pre-wrap leading-relaxed">${formattedContent}</p></div><p class="text-dark-500 text-xs mt-1.5 mr-2 text-right">${timestamp}</p></div></div><div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div>`;
    } else {
      const msgId = `ai-msg-${Date.now()}`;
      messageDiv.innerHTML = `<div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg></div><div class="flex-1 max-w-3xl"><div class="ai-message-content glass-effect rounded-2xl rounded-tl-sm p-5 border border-primary-500/20 hover:border-primary-500/30 transition-all group relative"><div class="ai-response-content" id="${msgId}"></div><button onclick="window.copyAIResponse(this, document.getElementById('${msgId}').innerText)" class="ai-copy-btn absolute top-3 right-3 p-2 rounded-lg bg-dark-800/80 hover:bg-dark-700 text-dark-400 hover:text-white transition-all" title="Copy response"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button></div><div class="flex items-center gap-3 mt-2 ml-2"><p class="text-dark-500 text-xs">${timestamp}</p><span class="text-dark-600">•</span><span class="text-dark-500 text-xs">AI Assistant</span></div></div>`;
      const contentDiv = messageDiv.querySelector(`#${msgId}`);
      if (contentDiv) contentDiv.innerHTML = sanitizeHTML(formattedContent);
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
  }

  function addTypingIndicator(): string {
    if (!messagesContainer) return '';
    const typingId = `typing-${Date.now()}`;
    const typingDiv = document.createElement('div');
    typingDiv.id = typingId;
    typingDiv.className = 'flex items-start gap-4 ai-chat-message animate-fade-in-up';
    typingDiv.innerHTML = `<div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25 animate-pulse-slow"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg></div><div class="flex-1 max-w-3xl"><div class="glass-effect rounded-2xl rounded-tl-sm p-5 border border-primary-500/20 ai-message-loading"><div class="flex items-center gap-4"><div class="flex gap-2"><div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div><div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div><div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div></div><span class="text-dark-400 text-sm font-medium">Analyzing data...</span></div></div></div>`;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
    return typingId;
  }

  function removeTypingIndicator(typingId: string): void {
    document.getElementById(typingId)?.remove();
  }

  // Event listeners
  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      if (confirm('Clear chat history?')) {
        conversationHistory = [];
        if (messagesContainer) {
          const welcomeMsg = messagesContainer.querySelector('.flex.items-start.gap-3');
          messagesContainer.innerHTML = '';
          if (welcomeMsg) messagesContainer.appendChild(welcomeMsg);
        }
      }
    });
  }

  console.log('✅ AI Agent chat initialized');
}
