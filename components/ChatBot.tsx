
import React, { useState, useRef, useEffect } from 'react';
import { getGeminiClient, isQuotaExceeded } from '../services/geminiService';
import { ChatMessage } from '../types';

export const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: '🥋 Greetings, Young Hero! I am the Vocab Sensei. Need help with a word or a superpower? Ask away!' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const ai = getGeminiClient();
      const chat = ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: {
          systemInstruction: 'You are "Vocab Sensei", a wise, funny, and encouraging martial arts master who loves teaching kids advanced vocabulary. Keep responses playful, use emojis, and explain difficult concepts simply.'
        }
      });
      const response = await chat.sendMessage({ message: input });
      setMessages(prev => [...prev, { role: 'model', text: response.text || 'Oops, sensei got distracted! 😅' }]);
    } catch (err: any) {
      console.error(err);
      if (isQuotaExceeded(err)) {
        setMessages(prev => [...prev, { role: 'model', text: '🧘 Master, I have spoken too much! (Quota reached). Please try again in a moment or use a paid key.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', text: '💨 Ah! A ninja smoke bomb blocked my connection. Try again!' }]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <div className="bg-white w-72 h-[400px] sm:w-80 sm:h-[450px] rounded-3xl shadow-2xl border-4 border-pink-300 flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="bg-gradient-to-r from-pink-400 to-yellow-400 p-3 sm:p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl">🥋</span>
              <h3 className="hero-font text-white text-lg sm:text-xl drop-shadow-sm">Vocab Sensei</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white hover:bg-white/20 p-1 rounded-full transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 bg-gradient-to-b from-yellow-50 to-pink-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-xs sm:text-sm font-medium ${m.role === 'user' ? 'bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-tr-none shadow-md' : 'bg-white text-gray-800 shadow-sm rounded-tl-none border-2 border-yellow-100'
                  }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white p-2 rounded-2xl shadow-sm border-2 border-yellow-100 rounded-tl-none flex gap-1">
                  <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 sm:p-4 bg-white border-t-2 border-pink-100 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask me anything! ✨"
              className="flex-1 bg-yellow-50 rounded-full px-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-800 border-2 border-yellow-200"
            />
            <button
              onClick={handleSend}
              className="bg-gradient-to-r from-pink-400 to-yellow-400 text-white p-2 rounded-full hover:scale-110 transition-all shadow-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-gradient-to-r from-pink-400 to-yellow-400 text-white w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-2xl hover:scale-110 transition-all flex items-center justify-center border-4 border-white animate-bounce-gentle"
          title="Chat with Vocab Sensei"
        >
          <span className="text-2xl sm:text-3xl">🥋</span>
        </button>
      )}
    </div>
  );
};
