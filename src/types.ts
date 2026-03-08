export interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  created_at: string;
}

export interface Conversation {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
  user_email?: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface AdminStats {
  userCount: number;
  conversationCount: number;
  messageCount: number;
}
