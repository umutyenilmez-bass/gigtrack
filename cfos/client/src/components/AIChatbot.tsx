import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bot, Send, X, MessageSquare, Sparkles, Key, User, Loader2, Trash2 } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AIChatbotProps {
  hasApiKey: boolean;
  hasCurrencyApiKey: boolean;
  hasDriveConfig: boolean;
  modelProvider: string;
  localEndpoint: string;
  modelName: string;
  onConfigUpdated: () => void;
}

export default function AIChatbot({
  hasApiKey,
  hasCurrencyApiKey,
  hasDriveConfig,
  modelProvider,
  localEndpoint,
  modelName,
  onConfigUpdated
}: AIChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const chatbotRef = useRef<HTMLDivElement>(null);

  // Click outside to close chatbot panel
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isOpen &&
        chatbotRef.current &&
        !chatbotRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('.floating-chat-btn')
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  
  const [provider, setProvider] = useState(modelProvider);
  const [endpoint, setEndpoint] = useState(localEndpoint);
  const [mName, setMName] = useState(modelName);
  const [apiKey, setApiKey] = useState('');
  const [currencyApiKey, setCurrencyApiKey] = useState('');


  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: 'Merhaba! Ben yapay zeka finans danışmanınız. Mevcut bütçeniz, borçlarınız ve harcamalarınızın tamamına hakimim. Borçlarınızı sıfırlamak veya tasarruf etmek için bana herhangi bir soru sorabilirsiniz.'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const token = localStorage.getItem('token');

  // Sync settings when props load
  useEffect(() => {
    setProvider(modelProvider);
    setEndpoint(localEndpoint);
    setMName(modelName);
  }, [modelProvider, localEndpoint, modelName]);

  // Load chat history from backend on open
  useEffect(() => {
    if (isOpen && token) {
      fetch('/api/chat/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.history && data.history.length > 0) {
            setMessages(data.history);
          }
        })
        .catch(err => console.error('Geçmiş yükleme hatası:', err));
    }
  }, [isOpen, token]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const saveConfig = async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/auth/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ modelProvider: provider, localEndpoint: endpoint, modelName: mName, apiKey, currencyApiKey })
      });
      if (response.ok) {
        onConfigUpdated();
        setShowKeyInput(false);
        setApiKey('');
        setCurrencyApiKey('');
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || 'Yapılandırma ayarları kaydedilemedi.');
      }
    } catch (err) { console.error(err); }
  };



  const handleClearHistory = async () => {
    if (!token || !window.confirm('Sohbet geçmişinizi silmek istediğinize emin misiniz?')) return;
    
    try {
      const response = await fetch('/api/chat/history', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setMessages([
          {
            role: 'model',
            text: 'Sohbet geçmişi silindi. Yeni sorularınızı sorabilirsiniz!'
          }
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || !token) return;

    // Check if configuration is missing
    if ((provider === 'gemini' || provider === 'groq' || provider === 'nvidia') && !hasApiKey) {
      setShowKeyInput(true);
      return;
    }

    const userMessageText = inputValue;
    setMessages(prev => [...prev, { role: 'user', text: userMessageText }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: userMessageText })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'İstek başarısız.');
      }

      setMessages(prev => [...prev, { role: 'model', text: data.text }]);
      if (data.refreshUI) {
        onConfigUpdated();
      }
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [
        ...prev,
        { role: 'model', text: error.message || 'Yapay zeka ile iletişim kurulamadı. Ayarlarınızı kontrol edin.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const hasValidConfig = provider === 'local' || hasApiKey;

  return (
    <>
      {/* Floating Chat Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="floating-chat-btn fixed bottom-6 right-6 z-50 rounded-full w-14 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 shadow-xl hover:from-blue-700 hover:to-indigo-700 text-white flex items-center justify-center p-0 transition-transform duration-200 hover:scale-105"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </Button>

      {/* Chat Sidebar/Panel */}
      {isOpen && (
        <div ref={chatbotRef} className="fixed bottom-24 right-6 z-50">
          <Card className="w-[400px] h-[550px] bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-2xl flex flex-col rounded-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-4 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                <Bot className="w-5 h-5 text-sky-300" />
              </div>
              <div>
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  Finans Ajanı <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                </h3>
                <p className="text-xs text-slate-200">7/24 Aktif Finansal Danışman</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearHistory}
                className="text-white hover:bg-white/10 w-8 h-8 rounded-lg"
                title="Sohbet Geçmişini Temizle"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="text-white hover:bg-white/10 w-8 h-8 rounded-lg"
                title="Yapay Zeka Sunucu Ayarları"
              >
                <Key className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/10 w-8 h-8 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Model Configure Panel */}
          {showKeyInput && (
            <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3 max-h-[280px] overflow-y-auto animate-in slide-in-from-top duration-200 text-xs">
              <div>
                <Label htmlFor="providerSelect" className="text-slate-800 font-semibold mb-1 block">Yapay Zeka Sağlayıcısı</Label>
                <select
                  id="providerSelect"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="gemini">Google Gemini API (Bulut)</option>
                  <option value="groq">Groq Console API (Bulut)</option>
                  <option value="nvidia">NVIDIA NIM API (Bulut)</option>
                  <option value="local">LM Studio / Yerel Model (Çevrimdışı/Ücretsiz)</option>
                </select>
              </div>

              {provider === 'local' ? (
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="endpointInput" className="text-slate-800 font-semibold mb-1 block">Yerel Sunucu Adresi</Label>
                    <Input
                      id="endpointInput"
                      type="text"
                      placeholder="http://localhost:1234/v1"
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      className="bg-white border-slate-300 py-1.5 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="modelNameInput" className="text-slate-800 font-semibold mb-1 block">Model Adı (Opsiyonel)</Label>
                    <Input
                      id="modelNameInput"
                      type="text"
                      placeholder="Örn: llama3, mistral"
                      value={mName}
                      onChange={(e) => setMName(e.target.value)}
                      className="bg-white border-slate-300 py-1.5 h-8 text-xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">LM Studio varsayılan model için boş bırakabilirsiniz.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="apiKeyInput" className="text-slate-800 font-semibold mb-1 block">
                      {provider === 'gemini' ? 'Gemini API Anahtarı' : provider === 'groq' ? 'Groq API Anahtarı' : 'NVIDIA API Anahtarı'}
                    </Label>
                    <Input
                      id="apiKeyInput"
                      type="password"
                      placeholder={hasApiKey ? "Kayıtlı Anahtar..." : (provider === 'gemini' ? "AIzaSy..." : provider === 'groq' ? "gsk_..." : "nvapi-...")}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="bg-white border-slate-300 py-1.5 h-8 text-xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Anahtarınız sunucumuzda güvenli bir şekilde saklanır.</p>
                  </div>
                  {(provider === 'groq' || provider === 'nvidia') && (
                    <div>
                      <Label htmlFor="modelNameInput" className="text-slate-800 font-semibold mb-1 block">Model Adı (Opsiyonel)</Label>
                      <Input
                        id="modelNameInput"
                        type="text"
                        placeholder={provider === 'groq' ? "Varsayılan: llama-3.3-70b-versatile" : "Varsayılan: meta/llama-3.1-8b-instruct"}
                        value={mName}
                        onChange={(e) => setMName(e.target.value)}
                        className="bg-white border-slate-300 py-1.5 h-8 text-xs"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Katalogdan istediğiniz modeli yazabilirsiniz (Örn: {provider === 'groq' ? 'mixtral-8x7b-32768' : 'nvidia/llama-3.1-nemotron-70b-instruct'}).
                      </p>
                    </div>
                  )}
                </div>
              )}



              <Button onClick={saveConfig} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-1 h-8 rounded-lg">
                Ayarları Kaydet
              </Button>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.map((message, idx) => (
              <div key={idx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`flex gap-2.5 max-w-[85%] ${
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div
                    className={`p-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap ${
                      message.role === 'user'
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-none'
                        : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-none'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-2.5 max-w-[85%] items-center">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="p-3 bg-white border border-slate-200/80 rounded-2xl rounded-tl-none text-slate-500 text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    Analiz yapılıyor...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Input Area */}
          <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 flex gap-2">
            <Input
              type="text"
              placeholder={hasValidConfig ? "Finansal danışmana sorun..." : "Lütfen önce model ayarlarını yapın..."}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={!hasValidConfig || isLoading}
              className="flex-1 bg-slate-50 focus-visible:ring-indigo-500"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!hasValidConfig || !inputValue.trim() || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          </Card>
        </div>
      )}
    </>
  );
}
