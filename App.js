
// ============================================================
//  Ke - Premium Messenger  |  Single-file Expo build
//  Screens: Splash, Auth, Chats, Groups, Chat Room, Group Info,
//  Video Call (LiveKit), Secret Chat (PIN), Calls, Profile
//  Backend: Supabase (Auth + DB + Realtime + Storage)
// ============================================================
import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useState, useContext, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  FlatList, Modal, KeyboardAvoidingView, Platform, ScrollView,
  Animated, Alert, Dimensions, TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { NavigationContainer, useNavigation, useRoute, useFocusEffect, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';
import { Room, RoomEvent, Track } from 'livekit-client';
import * as LiveKitRN from '@livekit/react-native';

const { registerGlobals, VideoView } = LiveKitRN;
const AudioSession = LiveKitRN.AudioSession;
registerGlobals();

// ---------------- Config ----------------
const EXTRA = (Constants.expoConfig && Constants.expoConfig.extra) || {};
const SUPABASE_URL = EXTRA.supabaseUrl || 'https://lwsrroxcyanixrondczr.supabase.co';
const SUPABASE_KEY = EXTRA.supabaseKey || 'sb_publishable_fU_c1WSDb8USSQRIq4JLog_vyp1KbSC';
const LIVEKIT_URL = EXTRA.livekitUrl || 'wss://ke-omvez0ro.livekit.cloud';
const LIVEKIT_API_KEY = process.env.EXPO_PUBLIC_LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.EXPO_PUBLIC_LIVEKIT_API_SECRET || '';

// ---------------- Supabase ----------------
const authStorage = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: authStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

// ---------------- Theme ----------------
const C = {
  bg: '#08080D', card: '#12121A', card2: '#1A1A24', border: '#262633',
  text: '#F4F4F8', sub: '#82828E', orange: '#FF9F0A', orange2: '#FF5E3A',
  green: '#30D158', red: '#FF453A', yellow: '#FFD60A',
};
const { width: W } = Dimensions.get('window');

// ---------------- Helpers ----------------
const dice = (seed) => `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(seed || 'ke')}&backgroundColor=1c1c26`;
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso); let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
function dayLabel(iso) {
  const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString();
}
const quickReactions = ['❤️', '👍', '🔥', '😂', '😮', '😢'];
const emojiSet = ['😀','😂','😊','😍','😎','🤔','😅','😭','😡','👍','👎','🙏','👏','🔥','❤️','💯','🎉','✨','😴','🤝','💪','🌹','🍕','⚽'];

// LiveKit JWT (HS256, no server needed)
function makeLiveKitToken(identity, name, roomName) {
  const b64 = (o) => CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(JSON.stringify(o)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({
    iss: LIVEKIT_API_KEY, sub: identity, iat: now - 10, nbf: now - 10, exp: now + 6 * 3600,
    metadata: name || '',
    video: { roomJoin: true, room: roomName, canPublish: true, canSubscribe: true },
  });
  const sig = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(header + '.' + payload, LIVEKIT_API_SECRET || 'ke'))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${header}.${payload}.${sig}`;
}

// ---------------- Global store ----------------
const store = { profiles: [], online: new Set() };
async function loadProfiles() {
  const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
  if (data) store.profiles = data;
  return store.profiles;
}
const profileOf = (id) => store.profiles.find((p) => p.id === id) || null;

const AppCtx = React.createContext(null);
const useApp = () => useContext(AppCtx);

// ---------------- UI Atoms ----------------
function Avatar({ uri, seed, size = 46, online, style }) {
  const ring = (
    <LinearGradient colors={['#FF9F0A', '#FFD60A', '#5E5CE6', '#BF5AF2']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ padding: 2.5, borderRadius: size, ...(style || {}) }}>
      <View style={{ width: size - 5, height: size - 5, borderRadius: (size - 5) / 2, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {uri || seed ? (
          <Image source={{ uri: uri || dice(seed) }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Ionicons name="person" size={size * 0.45} color={C.sub} />
        )}
      </View>
    </LinearGradient>
  );
  if (!online) return ring;
  return (
    <View>
      {ring}
      <View style={st.onlineDot} />
    </View>
  );
}

function GradientFab({ icon = 'arrow-up', size = 44, onPress, colors }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ width: size, height: size }}>
      <LinearGradient colors={colors || [C.orange, C.orange2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={size * 0.5} color="#111" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

function CircleBtn({ icon, onPress, size = 38, bg = C.card2, color = C.text, style }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </TouchableOpacity>
  );
}

function LogoMark({ size = 120 }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <LinearGradient colors={['#FF9F0A', '#FFD60A', '#5E5CE6', '#0A84FF', '#BF5AF2', '#FF9F0A']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, padding: 4, transform: [{ rotate: '-8deg' }] }}>
        <View style={{ flex: 1, borderRadius: size / 2, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.orange, fontSize: size * 0.42, fontStyle: 'italic', fontWeight: '800' }}>Ke</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function Header({ title, subtitle, onBack, right, center }) {
  return (
    <View style={st.header}>
      {onBack ? <CircleBtn icon="chevron-back" onPress={onBack} /> : <View style={{ width: 38 }} />}
      {center || (
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={st.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>{right}</View>
    </View>
  );
}

// ---------------- Splash ----------------
function SplashScreen() {
  return (
    <SafeAreaView style={[st.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <StatusBar style="light" />
      <LogoMark size={150} />
      <Text style={{ color: C.sub, marginTop: 26, letterSpacing: 4, fontSize: 13 }}>Connect · Chat · Call</Text>
      <Text style={{ color: '#55555F', marginTop: 6, fontSize: 11 }}>More Than Just Messaging</Text>
    </SafeAreaView>
  );
}

// ---------------- Auth ----------------
function AuthScreen() {
  const nav = useNavigation();
  const { setBootProfile } = useApp();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    Keyboard.dismiss();
    if (!email.includes('@') || pass.length < 6) { setErr('Valid email আর কমপক্ষে ৬ অক্ষরের password দিন'); return; }
    setBusy(true); setErr('');
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password: pass });
        if (error) setErr(error.message);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pass });
        if (error) setErr(error.message);
      }
    } catch (e) { setErr(e.message || 'Something went wrong'); }
    setBusy(false);
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 34 }}>
            <LogoMark size={104} />
            <Text style={{ color: C.text, fontSize: 26, fontWeight: '800', marginTop: 20 }}>{mode === 'login' ? 'Welcome back' : 'Create account'}</Text>
            <Text style={{ color: C.sub, marginTop: 6 }}>Sign in to continue to Ke</Text>
          </View>
          {mode === 'signup' ? (
            <TextInput placeholder="Your name" placeholderTextColor={C.sub} value={name} onChangeText={setName}
              style={st.input} autoCapitalize="words" />
          ) : null}
          <TextInput placeholder="Email" placeholderTextColor={C.sub} value={email} onChangeText={setEmail}
            style={st.input} autoCapitalize="none" keyboardType="email-address" />
          <TextInput placeholder="Password" placeholderTextColor={C.sub} value={pass} onChangeText={setPass}
            style={st.input} secureTextEntry />
          {err ? <Text style={{ color: C.red, marginBottom: 10, fontSize: 12 }}>{err}</Text> : null}
          <TouchableOpacity onPress={submit} disabled={busy} activeOpacity={0.9}>
            <LinearGradient colors={[C.orange, C.orange2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8, opacity: busy ? 0.6 : 1 }}>
              <Text style={{ color: '#111', fontWeight: '800', fontSize: 15 }}>{busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Sign Up'}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(''); }} style={{ marginTop: 18, alignItems: 'center' }}>
            <Text style={{ color: C.sub }}>{mode === 'login' ? "New here? " : 'Already have an account? '}
              <Text style={{ color: C.orange, fontWeight: '700' }}>{mode === 'login' ? 'Create account' : 'Login'}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------- Data helpers ----------------
async function myChatIds(uid, type) {
  let q = supabase.from('chat_members').select('chat_id').eq('user_id', uid);
  const { data } = await q;
  if (!data || !data.length) return [];
  const ids = data.map((r) => r.chat_id);
  let cq = supabase.from('chats').select('*').in('id', ids).order('created_at', { ascending: false });
  if (type) cq = cq.eq('type', type);
  const { data: chats } = await cq;
  return chats || [];
}
async function lastMessage(chatId) {
  const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId)
    .order('created_at', { ascending: false }).limit(1);
  return data && data[0] ? data[0] : null;
}
async function chatMembers(chatId) {
  const { data } = await supabase.from('chat_members').select('*').eq('chat_id', chatId);
  return data || [];
}
function previewOf(msg) {
  if (!msg) return 'Say hello 👋';
  if (msg.content && msg.content.startsWith('img:')) return '📷 Photo';
  if (msg.content === 'call:video') return '📹 Video call';
  return msg.content || '';
}
function titleForChat(chat, uid) {
  if (chat.type === 'group') return chat.name || 'Group';
  if (chat.type === 'secret') return chat.name || 'Secret Chat';
  return chat.name || 'Chat';
}
async function resolveDmPeer(chat, uid) {
  if (chat.type !== 'dm' && chat.type !== 'secret') return null;
  const members = await chatMembers(chat.id);
  const other = members.find((m) => m.user_id !== uid);
  return other ? profileOf(other.user_id) : null;
}

// ---------------- Chats list ----------------
function ChatsScreen() {
  const nav = useNavigation();
  const { session, online } = useApp();
  const uid = session.user.id;
  const [chats, setChats] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    await loadProfiles();
    const list = await myChatIds(uid);
    const m = {};
    for (const ch of list) {
      const lm = await lastMessage(ch.id);
      const members = await chatMembers(ch.id);
      let title = titleForChat(ch, uid);
      let avatarUri = ch.avatar_url;
      let peerId = null;
      if (ch.type === 'dm' || ch.type === 'secret') {
        const peer = await resolveDmPeer(ch, uid);
        if (peer) { title = peer.display_name || peer.username; avatarUri = peer.avatar_url; peerId = peer.id; }
      }
      m[ch.id] = { last: lm, members, title, avatarUri, peerId };
    }
    setChats(list);
    setMeta(m);
    setLoading(false);
  }, [uid]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => {
    const chan = supabase.channel('chats-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, reload)
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [reload]);

  const filtered = chats.filter((c) => {
    const t = (meta[c.id]?.title || '').toLowerCase();
    return t.includes(query.toLowerCase());
  });

  const groups = chats.filter((c) => c.type === 'group');

  function renderItem({ item }) {
    const m = meta[item.id] || {};
    const lm = m.last;
    const unread = lm && lm.sender_id !== uid;
    return (
      <TouchableOpacity style={st.chatRow} activeOpacity={0.75}
        onPress={() => nav.navigate('ChatRoom', { chatId: item.id, title: m.title, avatarUri: m.avatarUri, isGroup: item.type === 'group', isSecret: item.type === 'secret', members: m.members })}>
        <Avatar uri={m.avatarUri} seed={m.title} size={48} online={m.peerId ? online.has(m.peerId) : false} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={st.chatName} numberOfLines={1}>{m.title}</Text>
            <Text style={st.chatTime}>{lm ? fmtTime(lm.created_at) : ''}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
            <Text style={[st.chatPrev, unread && { color: C.text, fontWeight: '600' }]} numberOfLines={1}>
              {lm ? (lm.sender_id === uid ? `You: ${previewOf(lm)}` : (profileOf(lm.sender_id)?.display_name || '') + ': ' + previewOf(lm)) : previewOf(null)}
            </Text>
            {unread ? <View style={st.unreadDot} /> : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.listHeader}>
        <Text style={{ color: C.orange, fontSize: 26, fontWeight: '800', fontStyle: 'italic' }}>Ke</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <CircleBtn icon="search" onPress={() => {}} size={36} />
          <CircleBtn icon="add" onPress={() => nav.navigate('NewChat', {})} size={36} />
        </View>
      </View>
      <View style={st.searchWrap}>
        <Ionicons name="search" size={15} color={C.sub} />
        <TextInput placeholder="Search chats…" placeholderTextColor={C.sub} value={query} onChangeText={setQuery}
          style={st.searchInput} />
      </View>
      <View style={{ height: 96 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14, alignItems: 'center' }}>
          <TouchableOpacity style={{ alignItems: 'center', width: 62 }} onPress={() => nav.navigate('NewChat', { group: true })}>
            <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.orange, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="people" size={22} color={C.orange} />
            </View>
            <Text style={st.storyLabel}>New Group</Text>
          </TouchableOpacity>
          {groups.map((g) => (
            <TouchableOpacity key={g.id} style={{ alignItems: 'center', width: 62 }}
              onPress={() => nav.navigate('ChatRoom', { chatId: g.id, title: g.name || 'Group', isGroup: true })}>
              <Avatar seed={g.name || 'group'} uri={g.avatar_url} size={56} />
              <Text style={st.storyLabel} numberOfLines={1}>{g.name || 'Group'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <FlatList data={filtered} keyExtractor={(i) => i.id} renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListHeaderComponent={
          <TouchableOpacity style={st.chatRow} activeOpacity={0.75} onPress={() => nav.navigate('SecretHome')}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="lock-closed" size={20} color={C.orange} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={st.chatName}>Secret Chat</Text>
              <Text style={st.chatPrev}>PIN protected 🔒</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.sub} />
          </TouchableOpacity>
        }
        ListEmptyComponent={!loading ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="chatbubbles-outline" size={44} color={C.border} />
            <Text style={{ color: C.sub, marginTop: 10 }}>No chats yet — tap + to start one</Text>
          </View>
        ) : null} />
    </SafeAreaView>
  );
}

// ---------------- Groups ----------------
function GroupsScreen() {
  const nav = useNavigation();
  const { session } = useApp();
  const uid = session.user.id;
  const [groups, setGroups] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [gname, setGname] = useState('');

  const reload = useCallback(async () => {
    await loadProfiles();
    setGroups(await myChatIds(uid, 'group'));
  }, [uid]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  async function createGroup() {
    if (!gname.trim()) return;
    const { data: chat } = await supabase.from('chats').insert({ type: 'group', name: gname.trim(), created_by: uid }).select().single();
    if (chat) {
      await supabase.from('chat_members').insert({ chat_id: chat.id, user_id: uid, role: 'admin' });
      setShowNew(false); setGname('');
      reload();
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Header title="Groups" right={<CircleBtn icon="add" onPress={() => setShowNew(true)} />} />
      <FlatList data={groups} keyExtractor={(i) => i.id} contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={st.chatRow} activeOpacity={0.75}
            onPress={() => nav.navigate('ChatRoom', { chatId: item.id, title: item.name || 'Group', isGroup: true })}>
            <Avatar seed={item.name || 'group'} uri={item.avatar_url} size={48} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={st.chatName}>{item.name || 'Group'}</Text>
              <Text style={st.chatPrev}>Tap to open group</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.sub} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="people-outline" size={44} color={C.border} />
            <Text style={{ color: C.sub, marginTop: 10 }}>No groups yet</Text>
          </View>
        } />
      <Modal visible={showNew} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowNew(false)}>
          <View style={st.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={st.modalCard}>
                <Text style={{ color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 14 }}>Create Group</Text>
                <TextInput placeholder="Group name (e.g. Gaming Squad)" placeholderTextColor={C.sub} value={gname}
                  onChangeText={setGname} style={st.input} autoFocus />
                <TouchableOpacity onPress={createGroup} activeOpacity={0.9}>
                  <LinearGradient colors={[C.orange, C.orange2]} style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 }}>
                    <Text style={{ color: '#111', fontWeight: '800' }}>Create</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------- New chat / New group members ----------------
function NewChatScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { session } = useApp();
  const uid = session.user.id;
  const makeGroup = route.params && route.params.group;
  const secretMode = route.params && route.params.secret;
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    loadProfiles().then(() => setUsers(store.profiles.filter((p) => p.id !== uid)));
  }, []);

  async function openChat(user) {
    setBusyId(user.id);
    try {
      const mine = await myChatIds(uid);
      let found = null;
      for (const ch of mine) {
        if (ch.type !== (secretMode ? 'secret' : 'dm')) continue;
        const members = await chatMembers(ch.id);
        if (members.some((m) => m.user_id === user.id)) { found = ch; break; }
      }
      if (!found) {
        const type = secretMode ? 'secret' : (makeGroup ? 'group' : 'dm');
        const payload = makeGroup ? { type, name: `${user.display_name || 'Group'}`, created_by: uid }
          : { type, name: secretMode ? `🔒 ${user.display_name || 'Secret'}` : null, created_by: uid };
        const { data: chat } = await supabase.from('chats').insert(payload).select().single();
        if (chat) {
          await supabase.from('chat_members').insert([
            { chat_id: chat.id, user_id: uid, role: 'admin' },
            { chat_id: chat.id, user_id: user.id, role: 'member' },
          ]);
          found = chat;
        }
      }
      if (found) {
        nav.replace('ChatRoom', {
          chatId: found.id,
          title: makeGroup ? (found.name || 'Group') : (user.display_name || user.username),
          avatarUri: makeGroup ? null : user.avatar_url,
          isGroup: !!makeGroup, isSecret: !!secretMode,
        });
      }
    } catch (e) { Alert.alert('Error', e.message); }
    setBusyId(null);
  }

  const filtered = users.filter((u) => (u.display_name || u.username || '').toLowerCase().includes(query.toLowerCase()));
  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Header title={makeGroup ? 'New Group — add friend' : secretMode ? 'New Secret Chat' : 'New Chat'} onBack={() => nav.goBack()} />
      <View style={[st.searchWrap, { marginHorizontal: 16 }]}>
        <Ionicons name="search" size={15} color={C.sub} />
        <TextInput placeholder="Search people…" placeholderTextColor={C.sub} value={query} onChangeText={setQuery} style={st.searchInput} />
      </View>
      <FlatList data={filtered} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={st.chatRow} activeOpacity={0.75} disabled={busyId === item.id} onPress={() => openChat(item)}>
            <Avatar uri={item.avatar_url} seed={item.username} size={46} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={st.chatName}>{item.display_name || item.username}</Text>
              <Text style={st.chatPrev}>@{item.username || 'user'}</Text>
            </View>
            {busyId === item.id ? <Text style={{ color: C.orange }}>Opening…</Text>
              : <Ionicons name={makeGroup ? 'add-circle-outline' : 'chatbubble-outline'} size={20} color={C.orange} />}
          </TouchableOpacity>
        )} />
    </SafeAreaView>
  );
}

// ---------------- Group Info ----------------
function GroupInfoScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { session, online } = useApp();
  const uid = session.user.id;
  const chatId = route.params.chatId;
  const [chat, setChat] = useState(null);
  const [members, setMembers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    await loadProfiles();
    const { data: c } = await supabase.from('chats').select('*').eq('id', chatId).single();
    setChat(c);
    setMembers(await chatMembers(chatId));
  }, [chatId]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  async function addMember(user) {
    await supabase.from('chat_members').insert({ chat_id: chatId, user_id: user.id, role: 'member' });
    setShowAdd(false); reload();
  }
  async function leaveGroup() {
    Alert.alert('Leave Group', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        await supabase.from('chat_members').delete().eq('chat_id', chatId).eq('user_id', uid);
        nav.popToTop();
      } },
    ]);
  }

  const nonMembers = store.profiles.filter((p) => p.id !== uid && !members.some((m) => m.user_id === p.id))
    .filter((p) => (p.display_name || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Header title="Group Info" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Avatar seed={chat?.name || 'group'} uri={chat?.avatar_url} size={84} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', marginTop: 12 }}>{chat?.name || 'Group'}</Text>
          <Text style={{ color: C.sub, marginTop: 3 }}>{members.length} members · Active now</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 24 }}>
          {[{ i: 'person-add', l: 'Add', fn: () => setShowAdd(true) }, { i: 'search', l: 'Search', fn: () => Alert.alert('Search', 'Use the member search below') }, { i: 'notifications-off', l: 'Mute', fn: () => Alert.alert('Muted', 'Group notifications muted') }, { i: 'ellipsis-horizontal', l: 'More', fn: () => Alert.alert('Ke', 'More options coming soon') }].map((a) => (
            <TouchableOpacity key={a.l} style={{ alignItems: 'center' }} onPress={a.fn}>
              <CircleBtn icon={a.i} size={46} />
              <Text style={{ color: C.sub, fontSize: 11, marginTop: 6 }}>{a.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={st.sectionLabel}>Members</Text>
        {members.map((m) => {
          const p = profileOf(m.user_id);
          const isOnline = online.has(m.user_id);
          return (
            <View key={m.user_id} style={st.chatRow}>
              <Avatar uri={p?.avatar_url} seed={p?.username || m.user_id} size={44} online={isOnline} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={st.chatName}>{m.user_id === uid ? 'You' : p?.display_name || 'User'}</Text>
                <Text style={st.chatPrev}>{m.role === 'admin' ? 'Admin' : isOnline ? 'Online' : 'Member'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.sub} />
            </View>
          );
        })}
        <TouchableOpacity style={[st.chatRow, { justifyContent: 'center', marginTop: 10 }]} onPress={leaveGroup}>
          <Ionicons name="exit-outline" size={18} color={C.red} />
          <Text style={{ color: C.red, fontWeight: '700', marginLeft: 8 }}>Leave Group</Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={showAdd} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowAdd(false)}>
          <View style={st.modalOverlayBottom}>
            <TouchableWithoutFeedback>
              <View style={[st.sheet, { maxHeight: '70%' }]}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 10 }}>Add Member</Text>
                <TextInput placeholder="Search…" placeholderTextColor={C.sub} value={query} onChangeText={setQuery} style={[st.input, { marginBottom: 8 }]} />
                <FlatList data={nonMembers} keyExtractor={(i) => i.id} renderItem={({ item }) => (
                  <TouchableOpacity style={st.chatRow} onPress={() => addMember(item)}>
                    <Avatar uri={item.avatar_url} seed={item.username} size={40} />
                    <Text style={[st.chatName, { marginLeft: 10, flex: 1 }]}>{item.display_name || item.username}</Text>
                    <Ionicons name="add" size={20} color={C.orange} />
                  </TouchableOpacity>
                )} />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------- Floating reaction ----------------
function FloatEmoji({ emoji }) {
  const v = useRef(new Animated.Value(0)).current;
  const left = 20 + Math.random() * (W - 120);
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.Text style={{
      position: 'absolute', bottom: 120, left, fontSize: 30,
      opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -110] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] }) }],
    }}>{emoji}</Animated.Text>
  );
}

// ---------------- Message bubble ----------------
function Bubble({ msg, mine, sender, reactions, onLongPress, onReact, onJoinCall }) {
  const isImg = msg.content && msg.content.startsWith('img:');
  const isCall = msg.content === 'call:video';
  const rmap = reactions || {};
  const chips = Object.entries(rmap).filter(([, users]) => users.length > 0);
  return (
    <View style={{ marginVertical: 3, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <TouchableOpacity activeOpacity={0.8} onLongPress={() => onLongPress(msg)} delayLongPress={250}>
        <View style={[st.bubble, mine ? st.bubbleMine : st.bubbleOther]}>
          {msg._reply ? (
            <View style={st.quoteBlock}>
              <Text style={st.quoteName}>{msg._reply.senderName}</Text>
              <Text style={st.quoteText} numberOfLines={1}>{msg._reply.preview}</Text>
            </View>
          ) : null}
          {isImg ? (
            <Image source={{ uri: msg.content.slice(4) }} style={{ width: 200, height: 250, borderRadius: 12 }} resizeMode="cover" />
          ) : isCall ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <LinearGradient colors={[C.orange, C.orange2]} style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="videocam" size={19} color="#111" />
              </LinearGradient>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '800', fontSize: 13 }}>Group Video Call</Text>
                <Text style={{ color: C.sub, fontSize: 11, marginTop: 1 }}>{mine ? 'You started a video call' : `${sender || 'Someone'} started a video call`}</Text>
              </View>
              <TouchableOpacity onPress={() => onJoinCall()} activeOpacity={0.85}>
                <LinearGradient colors={[C.orange, C.orange2]} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 }}>
                  <Text style={{ color: '#111', fontWeight: '800', fontSize: 12 }}>Join</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ color: mine ? '#1A1000' : C.text, fontSize: 15, lineHeight: 21 }}>{msg.content}</Text>
          )}
          <View style={{ flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', marginTop: 3, gap: 4 }}>
            {msg.edited_at ? <Text style={[st.msgMeta, { color: mine ? '#1A1000' : C.sub }]}>edited</Text> : null}
            <Text style={[st.msgMeta, { color: mine ? '#1A1000' : C.sub }]}>{fmtTime(msg.created_at)}</Text>
            {mine ? <Ionicons name="checkmark-done" size={11} color="#1A1000" /> : null}
          </View>
        </View>
      </TouchableOpacity>
      {chips.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: -6, marginHorizontal: 6, gap: 5 }}>
          {chips.map(([emoji, users]) => (
            <TouchableOpacity key={emoji} onPress={() => onReact(msg, emoji)} activeOpacity={0.8}
              style={[st.chip, users.includes(msg._me) && st.chipMine]}>
              <Text style={{ fontSize: 13 }}>{emoji}{users.length > 1 ? ` ${users.length}` : ''}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------- Chat Room ----------------
function ChatRoomScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { session, profile, online } = useApp();
  const uid = session.user.id;
  const p = route.params || {};
  const chatId = p.chatId;
  const isGroup = !!p.isGroup;
  const [title, setTitle] = useState(p.title || 'Chat');
  const [avatarUri, setAvatarUri] = useState(p.avatarUri || null);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState({});
  const [input, setInput] = useState('');
  const [replying, setReplying] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [typingName, setTypingName] = useState(null);
  const [floats, setFloats] = useState([]);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [members, setMembers] = useState(p.members || []);
  const [peerId, setPeerId] = useState(null);
  const chanRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTyping = useRef(0);
  const listRef = useRef(null);

  async function loadReactionsFor(ids) {
    if (!ids.length) { setReactions({}); return; }
    const { data } = await supabase.from('message_reactions').select('*').in('message_id', ids);
    const map = {};
    (data || []).forEach((r) => {
      if (!map[r.message_id]) map[r.message_id] = {};
      if (!map[r.message_id][r.emoji]) map[r.message_id][r.emoji] = [];
      map[r.message_id][r.emoji].push(r.user_id);
    });
    setReactions(map);
  }

  async function loadMessages() {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId)
      .order('created_at', { ascending: true }).limit(300);
    const rows = data || [];
    setMessages(rows);
    await loadReactionsFor(rows.map((r) => r.id));
  }

  useEffect(() => {
    loadMessages();
    (async () => {
      await loadProfiles();
      const mem = await chatMembers(chatId);
      setMembers(mem);
      if (!isGroup) {
        const other = mem.find((m) => m.user_id !== uid);
        if (other) {
          setPeerId(other.user_id);
          const pr = profileOf(other.user_id);
          if (pr) { setTitle(pr.display_name || pr.username); setAvatarUri(pr.avatar_url); }
        }
      }
      const { data: c } = await supabase.from('chats').select('*').eq('id', chatId).single();
      if (c && c.name) setTitle(c.name);
    })();
    const chan = supabase.channel(`room-${chatId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, () => loadMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        const ids = messagesRef.current.map((m) => m.id);
        if (ids.length) loadReactionsFor(ids);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload && payload.uid !== uid) {
          setTypingName(payload.name || 'Someone');
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTypingName(null), 1800);
        }
      })
      .subscribe();
    chanRef.current = chan;
    return () => { supabase.removeChannel(chan); clearTimeout(typingTimer.current); };
  }, [chatId]);

  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  function onChangeText(t) {
    setInput(t);
    const now = Date.now();
    if (t.length > 0 && now - lastTyping.current > 1500) {
      lastTyping.current = now;
      chanRef.current && chanRef.current.send({ type: 'broadcast', event: 'typing', payload: { uid, name: profile?.display_name || 'Someone' } });
    }
  }

  async function doSend(contentOverride) {
    const content = contentOverride !== undefined ? contentOverride : input.trim();
    if (!content) return;
    if (editing) {
      await supabase.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', editing.id);
      setEditing(null);
    } else {
      await supabase.from('messages').insert({ chat_id: chatId, sender_id: uid, content, reply_to: replying ? replying.id : null });
      setReplying(null);
    }
    if (contentOverride === undefined) setInput('');
  }

  async function pickAndSend(fromCamera) {
    setShowAttach(false);
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission', 'Camera/photo permission needed'); return; }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      const asset = res.assets[0];
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/\?.*/, '') || 'jpg';
      const path = `${chatId}/${Date.now()}.${ext === 'heic' ? 'jpg' : ext}`;
      const { error } = await supabase.storage.from('chat-media').upload(path, {
        uri: asset.uri, name: path, type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      });
      if (error) { Alert.alert('Upload failed', error.message); return; }
      const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
      doSend(`img:${data.publicUrl}`);
    } catch (e) { Alert.alert('Error', e.message); }
  }

  async function react(msg, emoji) {
    const mine = (reactions[msg.id] && reactions[msg.id][emoji] || []).includes(uid);
    spawnFloat(emoji);
    await supabase.from('message_reactions').delete().eq('message_id', msg.id).eq('user_id', uid);
    if (!mine) await supabase.from('message_reactions').insert({ message_id: msg.id, user_id: uid, emoji });
    loadReactionsFor(messages.map((m) => m.id));
  }

  function spawnFloat(emoji) {
    const id = Math.random().toString(36).slice(2);
    setFloats((f) => [...f, { id, emoji }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1050);
  }

  async function startCall(audioOnly) {
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: uid, content: 'call:video' });
    nav.navigate('VideoCall', { chatId, title, audioOnly: !!audioOnly });
  }

  async function forwardTo(targetChatId, content) {
    await supabase.from('messages').insert({ chat_id: targetChatId, sender_id: uid, content });
    setActionMsg(null);
    Alert.alert('Forwarded', 'Message sent');
  }

  const subtitle = typingName ? `${typingName} is typing…`
    : isGroup ? `${members.length} members · ${members.some((m) => m.user_id !== uid && online.has(m.user_id)) ? 'Active now' : 'Group'}`
    : peerId ? (online.has(peerId) ? 'Online' : 'offline') : '…';

  const data = messages.slice().reverse();
  const renderItem = ({ item, index }) => {
    const next = data[index + 1];
    const showDay = !next || dayLabel(next.created_at) !== dayLabel(item.created_at);
    const mine = item.sender_id === uid;
    const sender = profileOf(item.sender_id);
    let replyInfo = null;
    if (item.reply_to) {
      const orig = messages.find((m) => m.id === item.reply_to);
      if (orig) {
        const op = profileOf(orig.sender_id);
        replyInfo = { senderName: orig.sender_id === uid ? 'You' : op?.display_name || 'User', preview: previewOf(orig) };
      }
    }
    const enriched = { ...item, _reply: replyInfo, _me: uid };
    return (
      <View>
        {showDay ? (
          <View style={{ alignItems: 'center', marginVertical: 10 }}>
            <View style={{ backgroundColor: C.card2, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 }}>
              <Text style={{ color: C.sub, fontSize: 11, fontWeight: '700' }}>{dayLabel(item.created_at)}</Text>
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
          {!mine ? (
            <View style={{ marginRight: 6, marginBottom: 12 }}>
              <Avatar uri={sender?.avatar_url} seed={sender?.username || 'x'} size={28} />
            </View>
          ) : null}
          <View style={{ maxWidth: '76%' }}>
            {!mine && isGroup ? <Text style={{ color: C.sub, fontSize: 11, marginLeft: 10, marginBottom: 2 }}>{sender?.display_name || 'User'}</Text> : null}
            <Bubble msg={enriched} mine={mine} sender={sender?.display_name}
              reactions={reactions[item.id]}
              onLongPress={(m) => setActionMsg(m)}
              onReact={react}
              onJoinCall={() => nav.navigate('VideoCall', { chatId, title, audioOnly: false })} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
      <Header title={title} subtitle={subtitle}
        onBack={() => nav.goBack()}
        right={
          <>
            <CircleBtn icon="call" size={36} onPress={() => startCall(true)} />
            <CircleBtn icon="videocam" size={36} onPress={() => startCall(false)} />
            {isGroup ? <CircleBtn icon="information-circle-outline" size={36} onPress={() => nav.navigate('GroupInfo', { chatId })} /> : null}
          </>
        } />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        <View style={{ flex: 1 }}>
          <FlatList ref={listRef} data={data} inverted keyExtractor={(i) => i.id} renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
            onContentSizeChange={() => {}} />
          {floats.map((f) => <FloatEmoji key={f.id} emoji={f.emoji} />)}
        </View>

        {replying || editing ? (
          <View style={st.replyBar}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.orange, fontSize: 12, fontWeight: '800' }}>{editing ? 'Edit message' : `Reply to ${replying.sender_id === uid ? 'yourself' : profileOf(replying.sender_id)?.display_name || 'User'}`}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{previewOf(replying || editing)}</Text>
            </View>
            <TouchableOpacity onPress={() => { setReplying(null); setEditing(null); }}>
              <Ionicons name="close" size={18} color={C.sub} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={st.inputRow}>
          <CircleBtn icon={showEmoji ? 'keypad' : 'happy-outline'} size={38}
            onPress={() => { setShowEmoji(!showEmoji); setShowAttach(false); }} />
          <CircleBtn icon="add" size={38} style={{ marginLeft: 6 }}
            onPress={() => { setShowAttach(!showAttach); setShowEmoji(false); }} />
          <TextInput style={st.msgInput} placeholder="Type a message…" placeholderTextColor={C.sub}
            value={input} onChangeText={onChangeText} multiline
            onFocus={() => { setShowEmoji(false); setShowAttach(false); }} />
          <View style={{ marginLeft: 8 }}>
            <GradientFab icon={input.trim() ? 'arrow-up' : 'mic'} onPress={() => { if (input.trim()) doSend(); else Alert.alert('Voice note', 'Hold to record — coming soon'); }} />
          </View>
        </View>

        {showAttach ? (
          <View style={st.panel}>
            <TouchableOpacity style={st.panelBtn} onPress={() => pickAndSend(true)}>
              <CircleBtn icon="camera" size={46} bg="#1E2A38" color={C.orange} />
              <Text style={st.panelLabel}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.panelBtn} onPress={() => pickAndSend(false)}>
              <CircleBtn icon="images" size={46} bg="#1E2A38" color={C.orange} />
              <Text style={st.panelLabel}>Gallery</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showEmoji ? (
          <View style={st.panel}>
            <FlatList data={emojiSet} numColumns={8} keyExtractor={(e) => e}
              renderItem={({ item }) => (
                <TouchableOpacity style={{ width: `${100 / 8}%`, alignItems: 'center', paddingVertical: 8 }} onPress={() => setInput((t) => t + item)}>
                  <Text style={{ fontSize: 24 }}>{item}</Text>
                </TouchableOpacity>
              )} />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Message action sheet */}
      <Modal visible={!!actionMsg} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setActionMsg(null)}>
          <View style={st.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[st.sheet, { marginTop: 'auto', marginBottom: 90, marginHorizontal: 24 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 14 }}>
                  {quickReactions.map((e) => (
                    <TouchableOpacity key={e} onPress={() => { react(actionMsg, e); setActionMsg(null); }}>
                      <Text style={{ fontSize: 26 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {[
                  { i: 'arrow-undo-outline', l: 'Reply', fn: () => { setReplying(actionMsg); setActionMsg(null); } },
                  { i: 'copy-outline', l: 'Copy', fn: async () => { await Clipboard.setStringAsync(actionMsg.content.startsWith('img:') ? actionMsg.content.slice(4) : actionMsg.content); setActionMsg(null); } },
                  ...(actionMsg.sender_id === uid && actionMsg.content !== 'call:video' ? [
                    { i: 'create-outline', l: 'Edit', fn: () => { setEditing(actionMsg); setInput(actionMsg.content); setActionMsg(null); } },
                    { i: 'trash-outline', l: 'Delete', danger: true, fn: async () => { await supabase.from('messages').delete().eq('id', actionMsg.id); setActionMsg(null); } },
                  ] : []),
                  { i: 'arrow-redo-outline', l: 'Forward', fn: () => { setForwardMsg(actionMsg); setActionMsg(null); } },
                ].map((o) => (
                  <TouchableOpacity key={o.l} style={st.sheetRow} onPress={o.fn}>
                    <Ionicons name={o.i} size={18} color={o.danger ? C.red : C.text} />
                    <Text style={{ color: o.danger ? C.red : C.text, marginLeft: 12, fontWeight: '600' }}>{o.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Forward picker */}
      <ForwardPicker visible={!!forwardMsg} msg={forwardMsg} onClose={() => setForwardMsg(null)} onPick={(cid) => forwardTo(cid, forwardMsg.content)} />
    </SafeAreaView>
  );
}

function ForwardPicker({ visible, msg, onClose, onPick }) {
  const { session } = useApp();
  const uid = session.user.id;
  const [chats, setChats] = useState([]);
  useEffect(() => {
    if (!visible) return;
    myChatIds(uid).then(async (list) => {
      const out = [];
      for (const ch of list) {
        if (ch.type === 'secret') continue;
        let t = ch.name || 'Chat';
        let av = ch.avatar_url;
        if (ch.type === 'dm') {
          const peer = await resolveDmPeer(ch, uid);
          if (peer) { t = peer.display_name || peer.username; av = peer.avatar_url; }
        }
        out.push({ ...ch, _title: t, _avatar: av });
      }
      setChats(out);
    });
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={st.modalOverlayBottom}>
          <TouchableWithoutFeedback>
            <View style={[st.sheet, { maxHeight: '60%' }]}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 10 }}>Forward to…</Text>
              <FlatList data={chats} keyExtractor={(i) => i.id} renderItem={({ item }) => (
                <TouchableOpacity style={st.chatRow} onPress={() => onPick(item.id)}>
                  <Avatar uri={item._avatar} seed={item._title} size={40} />
                  <Text style={[st.chatName, { marginLeft: 10, flex: 1 }]}>{item._title}</Text>
                  <Ionicons name="arrow-redo" size={18} color={C.orange} />
                </TouchableOpacity>
              )} />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ---------------- Video Call (LiveKit) ----------------
function VideoCell({ participant, isLocal }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1200);
    return () => clearInterval(iv);
  }, []);
  const camPub = participant.getTrackPublication(Track.Source.Camera);
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const track = camPub && camPub.track;
  const trackRef = track ? { participant, publication: camPub, source: Track.Source.Camera } : null;
  const micOn = micPub && micPub.isMuted === false;
  const name = participant.name || (isLocal ? 'You' : 'User');
  void tick;
  return (
    <View style={st.vCell}>
      {trackRef ? (
        <VideoView trackRef={trackRef} style={StyleSheet.absoluteFill} objectFit="cover" mirror={isLocal} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card }}>
          <Avatar seed={name} size={64} />
        </View>
      )}
      <View style={st.vLabel}>
        <Ionicons name={micOn ? 'mic' : 'mic-off'} size={11} color={micOn ? C.green : C.red} />
        <Text style={{ color: '#fff', fontSize: 11, marginLeft: 4, fontWeight: '700' }}>{name}</Text>
      </View>
    </View>
  );
}

function VideoCallScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { session, profile } = useApp();
  const { chatId, title, audioOnly } = route.params || {};
  const roomRef = useRef(null);
  const callRowRef = useRef(null);
  const everJoined = useRef(false);
  const [parts, setParts] = useState([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(!audioOnly);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [status, setStatus] = useState('Connecting…');
  const [failed, setFailed] = useState('');

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        if (AudioSession && AudioSession.startAudioSession) {
          try { await AudioSession.startAudioSession(); } catch (e) {}
        }
        const room = new Room();
        roomRef.current = room;
        const name = profile?.display_name || profile?.username || 'User';
        const token = makeLiveKitToken(session.user.id, name, `ke-${chatId}`);
        await room.connect(LIVEKIT_URL, token);
        if (disposed) { room.disconnect(); return; }
        if (room.remoteParticipants.size >= 5) {
          setFailed('ভিডিও কলে সর্বোচ্চ ৫ জন জয়েন করতে পারবে। রুম এখন ফুল।');
          await room.disconnect();
          return;
        }
        await room.localParticipant.setCameraEnabled(!audioOnly);
        await room.localParticipant.setMicrophoneEnabled(true);
        const upd = () => setParts([room.localParticipant, ...Array.from(room.remoteParticipants.values())]);
        room.on(RoomEvent.ParticipantConnected, upd);
        room.on(RoomEvent.ParticipantDisconnected, upd);
        room.on(RoomEvent.TrackSubscribed, upd);
        room.on(RoomEvent.TrackUnsubscribed, upd);
        room.on(RoomEvent.LocalTrackPublished, upd);
        room.on(RoomEvent.LocalTrackUnpublished, upd);
        room.on(RoomEvent.TrackMuted, upd);
        room.on(RoomEvent.TrackUnmuted, upd);
        upd();
        everJoined.current = room.remoteParticipants.size > 0;
        setStatus('Connected');
        const { data } = await supabase.from('calls').insert({
          chat_id: chatId, caller_id: session.user.id,
          type: audioOnly ? 'audio' : 'video', status: 'joined',
        }).select().single();
        callRowRef.current = data;
      } catch (e) {
        setFailed(e && e.message ? e.message : 'Connection failed. Check internet.');
      }
    })();
    return () => {
      disposed = true;
      (async () => {
        try {
          const room = roomRef.current;
          if (room) {
            const wasCaller = !everJoined.current;
            if (room.state === 'connected') {
              const anyRemote = room.remoteParticipants.size > 0;
              if (callRowRef.current) {
                await supabase.from('calls').update({ status: anyRemote ? 'ended' : (wasCaller ? 'missed' : 'ended') }).eq('id', callRowRef.current.id);
              }
            }
            room.disconnect();
          }
          if (AudioSession && AudioSession.stopAudioSession) { try { await AudioSession.stopAudioSession(); } catch (e) {} }
        } catch (e) {}
      })();
    };
  }, []);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    setMicOn(next);
    await room.localParticipant.setMicrophoneEnabled(next);
  }
  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    setCamOn(next);
    await room.localParticipant.setCameraEnabled(next);
  }
  async function toggleSpeaker() {
    const next = !speakerOn;
    setSpeakerOn(next);
    if (AudioSession && AudioSession.setSpeakerphoneOn) {
      try { await AudioSession.setSpeakerphoneOn(next); } catch (e) {}
    }
  }
  function hangup() { nav.goBack(); }

  const cols = parts.length <= 1 ? 1 : parts.length <= 4 ? 2 : 3;
  return (
    <SafeAreaView style={[st.safe, { backgroundColor: '#000' }]} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
        <Ionicons name="videocam" size={16} color={C.orange} />
        <Text style={{ color: C.text, fontWeight: '800', marginLeft: 6, flex: 1 }} numberOfLines={1}>{title || 'Video Call'}</Text>
        <View style={{ backgroundColor: C.card2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
          <Text style={{ color: failed ? C.red : C.green, fontSize: 11, fontWeight: '700' }}>{failed ? 'Failed' : status}</Text>
        </View>
      </View>
      {failed ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Ionicons name="alert-circle-outline" size={52} color={C.red} />
          <Text style={{ color: C.text, marginTop: 14, textAlign: 'center', fontSize: 15 }}>{failed}</Text>
          <TouchableOpacity onPress={() => nav.goBack()} style={{ marginTop: 22, backgroundColor: C.orange, paddingHorizontal: 26, paddingVertical: 11, borderRadius: 22 }}>
            <Text style={{ color: '#111', fontWeight: '800' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center' }}>
            {parts.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.sub }}>Waiting for participants…</Text>
              </View>
            ) : parts.map((pt, i) => (
              <View key={pt.identity || i} style={{
                width: cols === 1 ? '96%' : cols === 2 ? '47%' : '31.5%',
                aspectRatio: cols === 1 ? 0.9 : 0.8,
                margin: '1%', borderRadius: 14, overflow: 'hidden', backgroundColor: C.card,
              }}>
                <VideoCell participant={pt} isLocal={i === 0} />
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 22, paddingVertical: 24 }}>
            <TouchableOpacity onPress={toggleSpeaker} style={[st.vBtn, { borderWidth: 2, borderColor: C.orange, backgroundColor: 'transparent' }]}>
              <Ionicons name="volume-high" size={22} color={C.orange} />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleCam} style={st.vBtn}>
              <Ionicons name={camOn ? 'videocam' : 'videocam-off'} size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleMic} style={st.vBtn}>
              <Ionicons name={micOn ? 'mic' : 'mic-off'} size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={hangup} style={[st.vBtn, { backgroundColor: C.red, width: 60, height: 60 }]}>
              <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

// ---------------- Calls log ----------------
function CallsScreen() {
  const { session } = useApp();
  const uid = session.user.id;
  const [tab, setTab] = useState('All');
  const [calls, setCalls] = useState([]);
  const [rows, setRows] = useState([]);

  const reload = useCallback(async () => {
    await loadProfiles();
    const { data } = await supabase.from('calls').select('*').order('created_at', { ascending: false }).limit(100);
    const list = data || [];
    setCalls(list);
    const out = [];
    for (const c of list) {
      let t = 'Call'; let av = null;
      const { data: ch } = await supabase.from('chats').select('*').eq('id', c.chat_id).single();
      if (ch) {
        if (ch.type === 'group') { t = ch.name || 'Group'; av = ch.avatar_url; }
        else {
          const peer = await resolveDmPeer(ch, uid);
          if (peer) { t = peer.display_name || peer.username; av = peer.avatar_url; }
        }
      }
      out.push({ ...c, _title: t, _avatar: av });
    }
    setRows(out);
  }, [uid]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => {
    const chan = supabase.channel('calls-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, reload)
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [reload]);

  const filtered = rows.filter((r) => {
    if (tab === 'Missed') return r.status === 'missed';
    if (tab === 'Outgoing') return r.caller_id === uid;
    return true;
  });

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Header title="Calls" />
      <View style={st.segWrap}>
        {['All', 'Missed', 'Outgoing'].map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[st.segBtn, tab === t && st.segActive]}>
            <Text style={[st.segText, tab === t && { color: '#111' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList data={filtered} keyExtractor={(i) => i.id} contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => {
          const mine = item.caller_id === uid;
          const missed = item.status === 'missed';
          return (
            <View style={st.chatRow}>
              <Avatar uri={item._avatar} seed={item._title} size={46} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[st.chatName, missed && { color: C.red }]}>{item._title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <Ionicons name={mine ? 'arrow-up-outline' : missed ? 'arrow-down-outline' : 'arrow-down-outline'}
                    size={12} color={missed ? C.red : mine ? C.green : C.orange} style={{ marginRight: 4 }} />
                  <Text style={st.chatPrev}>{mine ? 'Outgoing' : missed ? 'Missed call' : 'Incoming'} · {fmtTime(item.created_at)}</Text>
                </View>
              </View>
              <Ionicons name={item.type === 'audio' ? 'call' : 'videocam'} size={20} color={missed ? C.red : C.orange} />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="call-outline" size={44} color={C.border} />
            <Text style={{ color: C.sub, marginTop: 10 }}>No calls yet</Text>
          </View>
        } />
    </SafeAreaView>
  );
}

// ---------------- Profile ----------------
function ProfileScreen() {
  const nav = useNavigation();
  const { session, profile, online } = useApp();
  const items = [
    { i: 'person-outline', l: 'Account', fn: () => nav.navigate('EditProfile') },
    { i: 'lock-closed-outline', l: 'Privacy', fn: () => nav.navigate('SecretPin') },
    { i: 'notifications-outline', l: 'Notifications', fn: () => Alert.alert('Ke', 'Notification settings coming soon') },
    { i: 'moon-outline', l: 'Appearance', fn: () => Alert.alert('Ke', 'Dark theme is always on 🌙') },
    { i: 'help-buoy-outline', l: 'Help & Support', fn: () => Alert.alert('Ke', 'support@ke.app') },
  ];
  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Header title="Profile" right={<CircleBtn icon="create-outline" onPress={() => nav.navigate('EditProfile')} />} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ alignItems: 'center' }}>
          <Avatar uri={profile?.avatar_url} seed={profile?.username || session.user.id} size={96} online={true} />
          <Text style={{ color: C.text, fontSize: 21, fontWeight: '800', marginTop: 14 }}>{profile?.display_name || 'User'}</Text>
          <Text style={{ color: C.sub, marginTop: 3 }}>@{profile?.username || 'user'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.green, marginRight: 5 }} />
            <Text style={{ color: C.green, fontSize: 12, fontWeight: '700' }}>Online</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 24, marginBottom: 24 }}>
          {[['24', 'Posts'], ['1.2K', 'Followers'], ['428', 'Following']].map(([n, l]) => (
            <View key={l} style={{ alignItems: 'center' }}>
              <Text style={{ color: C.text, fontSize: 19, fontWeight: '800' }}>{n}</Text>
              <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{l}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.9} onPress={() => nav.navigate('EditProfile')}>
            <LinearGradient colors={[C.orange, C.orange2]} style={{ borderRadius: 13, paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ color: '#111', fontWeight: '800' }}>Edit Profile</Text>
            </LinearGradient>
          </TouchableOpacity>
          <CircleBtn icon="qr-code" size={46} />
        </View>
        <View style={{ marginTop: 26, backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' }}>
          {items.map((it, idx) => (
            <TouchableOpacity key={it.l} style={[st.menuRow, idx > 0 && { borderTopWidth: 1, borderTopColor: C.border }]} onPress={it.fn}>
              <Ionicons name={it.i} size={19} color={C.text} />
              <Text style={{ color: C.text, marginLeft: 13, flex: 1, fontWeight: '600' }}>{it.l}</Text>
              <Ionicons name="chevron-forward" size={15} color={C.sub} />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[st.menuRow, { justifyContent: 'center', marginTop: 22 }]}
          onPress={() => supabase.auth.signOut()}>
          <Ionicons name="log-out-outline" size={18} color={C.red} />
          <Text style={{ color: C.red, marginLeft: 8, fontWeight: '800' }}>Log Out</Text>
        </TouchableOpacity>
        <Text style={{ color: '#3A3A46', textAlign: 'center', marginTop: 20, fontSize: 11 }}>Ke · Stay Connected ♥</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------- Edit Profile ----------------
function EditProfileScreen() {
  const nav = useNavigation();
  const { session, profile, reloadProfiles } = useApp();
  const [name, setName] = useState(profile?.display_name || '');
  const [about, setAbout] = useState(profile?.about || '');
  const [avatar, setAvatar] = useState(profile?.avatar_url || '');
  const [saving, setSaving] = useState(false);

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets || !res.assets[0]) return;
    try {
      const asset = res.assets[0];
      const ext = (asset.uri.split('.').pop() || 'jpg').replace(/\?.*/, '') || 'jpg';
      const path = `avatars/${session.user.id}.${ext === 'heic' ? 'jpg' : ext}`;
      const { error } = await supabase.storage.from('chat-media').upload(path, {
        uri: asset.uri, name: path, type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      }, { upsert: true });
      if (error) { Alert.alert('Upload failed', error.message); return; }
      const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
      setAvatar(data.publicUrl);
    } catch (e) { Alert.alert('Error', e.message); }
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from('profiles').update({
      display_name: name.trim(), about: about.trim(), avatar_url: avatar || dice(session.user.id),
    }).eq('id', session.user.id);
    await reloadProfiles();
    setSaving(false);
    nav.goBack();
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Header title="Edit Profile" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <TouchableOpacity onPress={pickAvatar}>
            <Avatar uri={avatar} seed={profile?.username} size={110} />
            <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: C.orange, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera" size={15} color="#111" />
            </View>
          </TouchableOpacity>
          <Text style={{ color: C.sub, marginTop: 10, fontSize: 12 }}>Tap to change photo</Text>
        </View>
        <Text style={st.fieldLabel}>Display Name</Text>
        <TextInput style={st.input} value={name} onChangeText={setName} placeholderTextColor={C.sub} placeholder="Your name" />
        <Text style={st.fieldLabel}>About</Text>
        <TextInput style={[st.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]} value={about} onChangeText={setAbout}
          placeholderTextColor={C.sub} placeholder="Hey there! I am using Ke." multiline />
        <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.9}>
          <LinearGradient colors={[C.orange, C.orange2]} style={{ borderRadius: 13, paddingVertical: 14, alignItems: 'center', marginTop: 18, opacity: saving ? 0.6 : 1 }}>
            <Text style={{ color: '#111', fontWeight: '800' }}>{saving ? 'Saving…' : 'Save Changes'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------- Secret Chat (PIN) ----------------
function Keypad({ onKey, onBack }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
  return (
    <View style={{ width: 260, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
      {keys.map((k, i) => k === '' ? <View key={i} style={st.key} /> : (
        <TouchableOpacity key={i} style={st.key} onPress={() => (k === 'back' ? onBack() : onKey(k))} activeOpacity={0.7}>
          {k === 'back' ? <Ionicons name="backspace-outline" size={22} color={C.text} /> : <Text style={st.keyText}>{k}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PinDots({ len }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, marginVertical: 18 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < len ? C.orange : '#2A2A36' }} />
      ))}
    </View>
  );
}

function SecretPinScreen() {
  const nav = useNavigation();
  const [pin, setPin] = useState('');
  const [stored, setStored] = useState(null);
  const [mode, setMode] = useState('check');
  const [first, setFirst] = useState('');

  useEffect(() => {
    (async () => {
      const s = await SecureStore.getItemAsync('ke_pin');
      setStored(s);
      setMode(s ? 'verify' : 'set1');
    })();
  }, []);

  function press(k) {
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) setTimeout(() => handle(next), 150);
  }
  function back() { setPin((p) => p.slice(0, -1)); }

  async function handle(code) {
    if (mode === 'verify') {
      if (code === stored) { Alert.alert('Unlocked', 'Secret chat PIN verified ✔'); nav.goBack(); }
      else { setPin(''); Alert.alert('Wrong PIN', 'Try again'); }
    } else if (mode === 'set1') {
      setFirst(code); setPin(''); setMode('set2');
    } else if (mode === 'set2') {
      if (code === first) {
        await SecureStore.setItemAsync('ke_pin', code);
        setStored(code); setMode('verify');
        Alert.alert('Done', 'Secret Chat PIN set 🔒');
      } else { setPin(''); setMode('set1'); setFirst(''); Alert.alert('Mismatch', 'PINs did not match, try again'); }
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
      <Header title="Secret Chat PIN" onBack={() => nav.goBack()} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="lock-closed" size={26} color={C.orange} />
        </View>
        <Text style={{ color: C.text, fontSize: 19, fontWeight: '800', marginTop: 16 }}>
          {mode === 'verify' ? 'Enter your PIN' : mode === 'set1' ? 'Set a 4-digit PIN' : 'Confirm your PIN'}
        </Text>
        <Text style={{ color: C.sub, marginTop: 6, textAlign: 'center' }}>This PIN protects your secret chats</Text>
        <PinDots len={pin.length} />
        <Keypad onKey={press} onBack={back} />
      </View>
    </SafeAreaView>
  );
}

// ---------------- Secret Home ----------------
function SecretHomeScreen() {
  const nav = useNavigation();
  const { session } = useApp();
  const uid = session.user.id;
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [chats, setChats] = useState([]);
  const [meta, setMeta] = useState({});

  useEffect(() => {
    (async () => {
      const s = await SecureStore.getItemAsync('ke_pin');
      setHasPin(!!s);
    })();
  }, []);

  const reload = useCallback(async () => {
    await loadProfiles();
    const list = await myChatIds(uid, 'secret');
    const m = {};
    for (const ch of list) {
      const lm = await lastMessage(ch.id);
      const peer = await resolveDmPeer(ch, uid);
      m[ch.id] = { last: lm, title: peer?.display_name || ch.name || 'Secret Chat', avatar: peer?.avatar_url };
    }
    setChats(list);
    setMeta(m);
  }, [uid]);

  useFocusEffect(useCallback(() => {
    if (unlocked) reload();
  }, [unlocked, reload]));

  function press(k) {
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) setTimeout(async () => {
      const s = await SecureStore.getItemAsync('ke_pin');
      if (!s) {
        await SecureStore.setItemAsync('ke_pin', next);
        setHasPin(true); setUnlocked(true);
      } else if (next === s) {
        setUnlocked(true);
      } else {
        setPin('');
        Alert.alert('Wrong PIN', 'Try again');
      }
    }, 150);
  }

  if (!unlocked) {
    return (
      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
        <Header title="Secret Chat" onBack={() => nav.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Ionicons name="lock-closed" size={30} color={C.orange} />
          </View>
          <Text style={{ color: C.text, fontSize: 21, fontWeight: '800' }}>Secret Chat</Text>
          <Text style={{ color: C.sub, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }}>
            {hasPin ? 'This chat is locked. Please enter your PIN to unlock.' : 'Set a 4-digit PIN to protect your secret chats.'}
          </Text>
          <PinDots len={pin.length} />
          <Keypad onKey={press} onBack={() => setPin((p) => p.slice(0, -1))} />
          <TouchableOpacity style={{ marginTop: 22, width: 220 }} activeOpacity={0.9}
            onPress={async () => {
              const s = await SecureStore.getItemAsync('ke_pin');
              if (!s && pin.length === 4) { await SecureStore.setItemAsync('ke_pin', pin); setUnlocked(true); }
            }}>
            <LinearGradient colors={[C.orange, C.orange2]} style={{ borderRadius: 26, paddingVertical: 14, alignItems: 'center', opacity: pin.length === 4 ? 1 : 0.4 }}>
              <Text style={{ color: '#111', fontWeight: '800', fontSize: 15 }}>Unlock</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Header title="Secret Chat 🔒" onBack={() => nav.goBack()}
        right={<>
          <CircleBtn icon="lock-closed" size={36} onPress={() => { setUnlocked(false); setPin(''); }} />
          <CircleBtn icon="add" size={36} onPress={() => nav.navigate('NewChat', { secret: true })} />
        </>} />
      <FlatList data={chats} keyExtractor={(i) => i.id} contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={st.chatRow} activeOpacity={0.75}
            onPress={() => nav.navigate('ChatRoom', { chatId: item.id, title: meta[item.id]?.title || 'Secret', avatarUri: meta[item.id]?.avatar, isSecret: true })}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="lock-closed" size={18} color={C.orange} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={st.chatName}>🔒 {meta[item.id]?.title || 'Secret Chat'}</Text>
              <Text style={st.chatPrev} numberOfLines={1}>{previewOf(meta[item.id]?.last)}</Text>
            </View>
            <Text style={st.chatTime}>{meta[item.id]?.last ? fmtTime(meta[item.id].last.created_at) : ''}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="lock-closed-outline" size={44} color={C.border} />
            <Text style={{ color: C.sub, marginTop: 10 }}>No secret chats — tap + to create one</Text>
          </View>
        } />
    </SafeAreaView>
  );
}

// ---------------- Tabs & App ----------------
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border, height: 62, paddingBottom: 8, paddingTop: 6 },
      tabBarActiveTintColor: C.orange,
      tabBarInactiveTintColor: C.sub,
      tabBarIcon: ({ color, size }) => {
        const icons = { Chats: 'chatbubbles', Calls: 'call', Groups: 'people', Profile: 'person' };
        return <Ionicons name={icons[route.name]} size={size} color={color} />;
      },
    })}>
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Calls" component={CallsScreen} />
      <Tab.Screen name="Groups" component={GroupsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.bg, text: C.text, border: C.border, primary: C.orange },
};

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setOnline(new Set()); return undefined; }
    let active = true;
    (async () => {
      await loadProfiles();
      if (!active) return;
      setProfile(profileOf(session.user.id) || null);
      const ch = supabase.channel('online-users', { configs: { presence: { key: session.user.id } } });
      ch.on('presence', { event: 'sync' }, () => {
        setOnline(new Set(Object.keys(ch.presenceState())));
      }).subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await ch.track({ uid: session.user.id }); } catch (e) {}
        }
      });
      channelRef.current = ch;
    })();
    return () => {
      active = false;
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [session]);

  const channelRef = useRef(null);

  const reloadProfiles = useCallback(async () => {
    await loadProfiles();
    if (session) setProfile(profileOf(session.user.id) || null);
  }, [session]);

  if (!ready) return <SplashScreen />;

  const ctx = { session, profile, online, reloadProfiles };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppCtx.Provider value={ctx}>
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
            {session ? (
              <>
                <Stack.Screen name="Main" component={MainTabs} />
                <Stack.Screen name="ChatRoom" component={ChatRoomScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="GroupInfo" component={GroupInfoScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="NewChat" component={NewChatScreen} options={{ presentation: 'modal' }} />
                <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ presentation: 'modal' }} />
                <Stack.Screen name="SecretPin" component={SecretPinScreen} options={{ presentation: 'modal' }} />
                <Stack.Screen name="SecretHome" component={SecretHomeScreen} />
                <Stack.Screen name="VideoCall" component={VideoCallScreen} options={{ animation: 'fade', gestureEnabled: false }} />
              </>
            ) : (
              <Stack.Screen name="Auth" component={AuthScreen} options={{ animation: 'fade' }} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AppCtx.Provider>
    </SafeAreaProvider>
  );
}

// ---------------- Styles ----------------
const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 4 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  headerSub: { color: C.sub, fontSize: 12, marginTop: 1 },
  input: { backgroundColor: C.card, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 13, color: C.text, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, marginHorizontal: 16, paddingHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: C.text, fontSize: 14 },
  storyLabel: { color: C.sub, fontSize: 10, marginTop: 5, textAlign: 'center' },
  chatRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11 },
  chatName: { color: C.text, fontSize: 15.5, fontWeight: '700' },
  chatPrev: { color: C.sub, fontSize: 13, flexShrink: 1 },
  chatTime: { color: C.sub, fontSize: 11 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.orange, marginTop: 4 },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: C.green, borderWidth: 2, borderColor: C.bg },
  sectionLabel: { color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase' },
  bubble: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, maxWidth: '100%' },
  bubbleMine: { backgroundColor: C.orange, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: C.card2, borderBottomLeftRadius: 4 },
  msgMeta: { color: C.sub, fontSize: 10, opacity: 0.8 },
  quoteBlock: { borderLeftWidth: 3, borderLeftColor: C.orange, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 5 },
  quoteName: { color: C.orange, fontSize: 11, fontWeight: '800' },
  quoteText: { color: C.text, fontSize: 12 },
  chip: { flexDirection: 'row', backgroundColor: C.card2, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.border },
  chipMine: { borderColor: C.orange, backgroundColor: '#2A2013' },
  replyBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 14, paddingVertical: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  msgInput: { flex: 1, backgroundColor: C.card2, borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, color: C.text, fontSize: 15, maxHeight: 110, marginHorizontal: 6 },
  panel: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, padding: 14 },
  panelBtn: { alignItems: 'center', marginRight: 26 },
  panelLabel: { color: C.sub, fontSize: 11, marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center' },
  modalOverlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderRadius: 18, padding: 20, margin: 24, borderWidth: 1, borderColor: C.border },
  sheet: { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.border },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6 },
  segWrap: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, marginHorizontal: 16, marginBottom: 10, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segActive: { backgroundColor: C.orange },
  segText: { color: C.sub, fontWeight: '700', fontSize: 13 },
  vBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1C1C26', alignItems: 'center', justifyContent: 'center' },
  vCell: { flex: 1, backgroundColor: C.card },
  vLabel: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
  fieldLabel: { color: C.sub, fontSize: 12, fontWeight: '700', marginBottom: 6, marginLeft: 2 },
  key: { width: 78, height: 64, alignItems: 'center', justifyContent: 'center' },
  keyText: { color: C.text, fontSize: 24, fontWeight: '600' },
});
