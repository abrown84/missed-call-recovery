// @ts-nocheck
'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatWidgetProps {
  businessId?: string;
}

export function ChatWidget({ businessId }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm your assistant. I can help you understand your leads, prioritize callbacks, and answer questions about the platform. What would you like to know?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(1),
          businessId,
        }),
      });

      const data = await response.json();

      if (data.success && data.message) {
        setMessages([...newMessages, { role: 'assistant', content: data.message }]);
      } else {
        setMessages([
          ...newMessages,
          { role: 'assistant', content: "Sorry, I couldn't process that. Please try again." },
        ]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Connection error. Please check your internet and try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'fixed bottom-5 right-5 sm:bottom-6 sm:right-6 p-3.5 rounded-2xl shadow-panel z-50 transition-all',
          'bg-gradient-to-br from-primary to-accent text-primary-foreground',
          'hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring',
          isOpen && 'from-muted to-muted text-foreground border border-border'
        )}
        aria-label={isOpen ? 'Close assistant' : 'Open recovery assistant'}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {isOpen && (
        <div
          className="fixed bottom-20 sm:bottom-24 right-3 left-3 sm:left-auto sm:right-6 sm:w-96 h-[min(500px,70vh)] glass-card rounded-2xl border border-border/50 flex flex-col z-50 overflow-hidden shadow-panel animate-slide-up"
          role="dialog"
          aria-label="Recovery assistant"
        >
          <div className="p-4 border-b border-border/40 bg-gradient-to-r from-primary/90 to-accent/90">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Bot className="w-5 h-5 text-white" aria-hidden />
              </div>
              <div>
                <h3 className="font-semibold text-white">Recovery assistant</h3>
                <p className="text-xs text-white/80">AI-powered insights</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/40">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" aria-hidden />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-surface border border-border/50 text-foreground rounded-bl-md'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" aria-hidden />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary" aria-hidden />
                </div>
                <div className="bg-surface border border-border/50 rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-label="Thinking" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-border/40 bg-card/50">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your leads…"
                className="field-input flex-1"
                disabled={isLoading}
                aria-label="Message"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="btn-primary px-3"
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">Powered by Gemini AI</p>
          </div>
        </div>
      )}
    </>
  );
}
