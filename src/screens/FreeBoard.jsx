import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, addFreeBoardPost, updateFreeBoardPost, deleteFreeBoardPost, addFreeBoardComment, deleteFreeBoardComment, syncFreeBoardCommentCount, toggleFreeBoardCommentLike, updateFreeboardNickname, deletePhoto } from "../firebase.js";
import { formatRelativeTime } from "../utils/date.js";
import Linkify from "../utils/linkify.jsx";
import PhotoGallery from "../components/PhotoGallery.jsx";
import S from "../styles.js";

export default function FreeBoard({ authUser, user, setToast }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [posting, setPosting] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [editingPost, setEditingPost] = useState(null);

  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const commentInitRef = useRef(false);

  const [nickname, setNickname] = useState('');
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameEdit, setNicknameEdit] = useState('');
  const myNickname = nickname || user?.name || '익명';

  // 내 자유게시판 닉네임 실시간 구독
  useEffect(() => {
    if (!authUser?.uid) return;
    const unsub = onSnapshot(doc(db, 'users', authUser.uid), snap => {
      setNickname(snap.data()?.freeboardNickname || '');
    });
    return () => unsub();
  }, [authUser?.uid]);

  // 게시글 목록 실시간 구독
  useEffect(() => {
    const q = query(collection(db, 'publicBoard'), orderBy('createdAt', 'desc'));
    let unsub = () => {};
    let retryTimer = null;
    const subscribe = () => {
      unsub();
      unsub = onSnapshot(q, snap => {
        setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, () => { retryTimer = setTimeout(subscribe, 3000); });
    };
    subscribe();
    return () => { clearTimeout(retryTimer); unsub(); };
  }, []);

  // 댓글 실시간 구독
  useEffect(() => {
    if (!selectedPost) { setComments([]); return; }
    commentInitRef.current = false;
    const q = query(collection(db, 'publicBoard', selectedPost.id, 'comments'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      if (!commentInitRef.current) {
        commentInitRef.current = true;
        const actual = snap.docs.length;
        if (selectedPost.commentCount !== actual) {
          syncFreeBoardCommentCount(selectedPost.id, actual).catch(() => {});
        }
      }
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [selectedPost]);

  const handleUpdateNickname = async () => {
    const trimmed = nicknameEdit.trim();
    if (!trimmed || trimmed === myNickname) { setEditingNickname(false); return; }
    try {
      await updateFreeboardNickname(authUser.uid, trimmed);
      setToast('닉네임 변경 완료 ✅');
    } catch { setToast('변경 실패 ❌'); }
    setEditingNickname(false);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingPost(null);
    setTitle(''); setBody(''); setPhotos([]);
  };

  const handlePost = async () => {
    if (!title.trim()) return;
    setPosting(true);
    const optimistic = { id: `tmp_${Date.now()}`, title: title.trim(), body: body.trim(), uid: authUser.uid, nickname: myNickname, createdAt: new Date().toISOString(), photos };
    setPosts(prev => [optimistic, ...prev]);
    setTitle(''); setBody(''); setPhotos([]); setShowForm(false);
    try {
      const realId = await addFreeBoardPost({ title: optimistic.title, body: optimistic.body, uid: authUser.uid, nickname: myNickname, photos });
      setPosts(prev => prev.map(p => p.id === optimistic.id ? { ...p, id: realId } : p));
      setToast('게시글 등록 완료 ✅');
    } catch {
      setPosts(prev => prev.filter(p => p.id !== optimistic.id));
      setToast('등록 실패 ❌');
    }
    setPosting(false);
  };

  const startEdit = (post) => {
    setEditingPost(post);
    setTitle(post.title || '');
    setBody(post.body || '');
    setPhotos(post.photos || []);
    setShowForm(true);
    setSelectedPost(null);
  };

  const handleUpdate = async () => {
    if (!title.trim() || !editingPost) return;
    setPosting(true);
    const updates = { title: title.trim(), body: body.trim(), photos };
    try {
      await updateFreeBoardPost(editingPost.id, updates);
      setPosts(prev => prev.map(p => p.id === editingPost.id ? { ...p, ...updates, editedAt: new Date().toISOString() } : p));
      setToast('수정 완료 ✅');
      cancelForm();
    } catch { setToast('수정 실패 ❌'); }
    setPosting(false);
  };

  const handleDelete = async (postId) => {
    if (!window.confirm('게시글을 삭제할까요?')) return;
    try {
      const target = posts.find(p => p.id === postId);
      (target?.photos || []).forEach(p => p?.path && deletePhoto(p.path));
      await deleteFreeBoardPost(postId);
      if (selectedPost?.id === postId) setSelectedPost(null);
      setToast('삭제됐어요');
    } catch { setToast('삭제 실패 ❌'); }
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || !selectedPost) return;
    setPostingComment(true);
    try {
      await addFreeBoardComment(selectedPost.id, { text: commentText.trim(), uid: authUser.uid, nickname: myNickname });
      setCommentText('');
    } catch { setToast('댓글 등록 실패 ❌'); }
    setPostingComment(false);
  };

  const handleDeleteComment = async (commentId) => {
    try { await deleteFreeBoardComment(selectedPost.id, commentId); }
    catch { setToast('삭제 실패 ❌'); }
  };

  const hasCommentText = commentText.trim().length > 0;

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: '14px 16px 4px' }}>
        <div style={S.title}>자유게시판</div>
        <div style={S.sub}>모두가 자유롭게 쓰는 공간이에요</div>
      </div>

      {/* 내 닉네임 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px 10px' }}>
        <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>내 닉네임</span>
        {editingNickname ? (
          <input
            value={nicknameEdit}
            onChange={e => setNicknameEdit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleUpdateNickname(); if (e.key === 'Escape') setEditingNickname(false); }}
            onBlur={handleUpdateNickname}
            autoFocus
            maxLength={20}
            style={{ ...S.input, fontSize: 12, padding: '3px 8px', marginBottom: 0, width: 120 }}
          />
        ) : (
          <button onClick={() => { setNicknameEdit(myNickname); setEditingNickname(true); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--dm-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {myNickname} <span style={{ fontSize: 11 }}>✏️</span>
          </button>
        )}
      </div>

      <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.sectionEmoji}>📝</span>게시글
        </span>
        <button onClick={() => { if (showForm) cancelForm(); else setShowForm(true); }}
          style={{ fontSize: 11, fontWeight: 900, color: '#6C8EFF', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
          {showForm ? '취소' : '+ 글쓰기'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...S.card, marginBottom: 8 }}>
          {editingPost && <div style={{ fontSize: 11, fontWeight: 900, color: '#6C8EFF', marginBottom: 8 }}>✏️ 게시글 수정</div>}
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="제목 (필수)"
            style={{ ...S.input, marginBottom: 8, fontWeight: 700 }} maxLength={60} />
          <textarea value={body} onChange={e => setBody(e.target.value)}
            placeholder="내용 (선택)"
            rows={4} style={{ ...S.input, resize: 'none', marginBottom: 10 }} maxLength={500} />
          <div style={{ marginBottom: 10 }}>
            <PhotoGallery
              uid={authUser?.uid}
              pathPrefix={`freeboard_photos/${authUser?.uid}`}
              photos={photos}
              onChange={setPhotos}
              onError={setToast}
            />
          </div>
          <button onClick={editingPost ? handleUpdate : handlePost} disabled={posting || !title.trim()}
            style={{ ...S.btn, marginTop: 0 }}>
            {posting ? (editingPost ? '수정 중...' : '등록 중...') : (editingPost ? '✏️ 수정 완료' : '📝 글 등록')}
          </button>
        </div>
      )}

      {posts.length > 0 && (
        <div style={{ margin: '0 16px 8px', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--dm-border)' }}>
          {(showAll ? posts : posts.slice(0, 20)).map((p, i) => {
            const isMine = p.uid === authUser?.uid;
            const list = showAll ? posts : posts.slice(0, 20);
            return (
              <div key={p.id} onClick={() => setSelectedPost(p)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 14px', borderBottom: i < list.length - 1 ? '1px solid var(--dm-border)' : 'none', cursor: 'pointer' }}>
                {p.photos?.[0]?.url && (
                  <img src={p.photos[0].url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1.5px solid var(--dm-border)' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dm-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>{p.nickname}</span>
                    <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{formatRelativeTime(p.createdAt)}</span>
                    {p.commentCount > 0 && <span style={{ fontSize: 10, color: '#6C8EFF', fontWeight: 700 }}>💬 {p.commentCount}</span>}
                  </div>
                </div>
                {isMine && (
                  <button onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>✕</button>
                )}
              </div>
            );
          })}
          {posts.length > 20 && (
            <button onClick={() => setShowAll(v => !v)}
              style={{ width: '100%', padding: '10px', background: 'var(--dm-input)', border: 'none', color: '#6C8EFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderTop: '1px solid var(--dm-border)' }}>
              {showAll ? '접기 ▲' : `더보기 +${posts.length - 20} ▼`}
            </button>
          )}
        </div>
      )}
      {!loading && posts.length === 0 && !showForm && (
        <div style={{ margin: '0 16px 8px', borderRadius: 14, background: 'var(--dm-card)', border: '1.5px dashed var(--dm-border)', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>아직 게시글이 없어요. 첫 글을 남겨보세요 ✍️</div>
        </div>
      )}
      {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--dm-muted)' }}>불러오는 중...</div>}

      {/* 게시글 상세 모달 */}
      {selectedPost && (
        <div onClick={() => setSelectedPost(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--dm-bg)', borderRadius: '22px 22px 0 0',
            width: '100%', maxWidth: 480, maxHeight: 'calc(90vh - 84px)',
            marginBottom: 84,
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 -12px 48px rgba(0,0,0,0.5)',
            animation: 'slideUp 0.22s ease-out',
          }}>
            <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid var(--dm-border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6 }}>{selectedPost.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dm-sub)' }}>{selectedPost.nickname}</span>
                  <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>
                    {new Date(selectedPost.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {selectedPost.editedAt && <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>(수정됨)</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {selectedPost.uid === authUser?.uid && (
                  <button onClick={() => startEdit(selectedPost)}
                    style={{ background: 'transparent', border: 'none', color: '#6C8EFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '4px 6px' }}>
                    수정
                  </button>
                )}
                {selectedPost.uid === authUser?.uid && (
                  <button onClick={() => handleDelete(selectedPost.id)}
                    style={{ background: 'transparent', border: 'none', color: '#F87171', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '4px 6px' }}>
                    삭제
                  </button>
                )}
                <button onClick={() => setSelectedPost(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {selectedPost.body ? (
                <div style={{ fontSize: 14, color: 'var(--dm-text)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}><Linkify text={selectedPost.body} /></div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--dm-muted)', fontStyle: 'italic' }}>내용 없음</div>
              )}
              {(selectedPost.photos || []).map((p, i) => (
                <img key={p.path || i} src={p.url} alt="" style={{ width: '100%', borderRadius: 12, marginTop: 12, display: 'block' }} />
              ))}

              {/* 댓글 목록 */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--dm-border)' }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-muted)', marginBottom: 12 }}>💬 댓글 {comments.length > 0 ? comments.length : ''}</div>
                {comments.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--dm-muted)', fontSize: 13, padding: '12px 0' }}>
                    아직 댓글이 없어요. 첫 댓글을 남겨보세요 💬
                  </div>
                ) : (
                  comments.map((c) => {
                    const isMine = c.uid === authUser?.uid;
                    const likedBy = c.likedBy || [];
                    const isLiked = likedBy.includes(authUser?.uid);
                    return (
                      <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 999, background: isMine ? 'rgba(75,111,255,.2)' : 'var(--dm-row)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: isMine ? '#6C8EFF' : 'var(--dm-muted)', flexShrink: 0 }}>
                          {(c.nickname || '?')[0]}
                        </div>
                        <div style={{ flex: 1, background: isMine ? 'rgba(75,111,255,.07)' : 'var(--dm-card)', border: `1px solid ${isMine ? 'rgba(108,142,255,.25)' : 'var(--dm-border)'}`, borderRadius: 12, padding: '8px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 900, color: isMine ? '#6C8EFF' : 'var(--dm-text)' }}>{c.nickname}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>
                                {formatRelativeTime(c.createdAt)}
                              </span>
                              {isMine && (
                                <button onClick={() => handleDeleteComment(c.id)}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 13, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--dm-text)', lineHeight: 1.6 }}><Linkify text={c.text} /></div>
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center' }}>
                            <button
                              onClick={() => toggleFreeBoardCommentLike(selectedPost.id, c.id, authUser?.uid).catch(() => {})}
                              style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', color: isLiked ? '#F87171' : 'var(--dm-muted)', fontSize: 11, fontWeight: isLiked ? 700 : 400 }}>
                              {isLiked ? '❤️' : '🤍'} {likedBy.length > 0 ? likedBy.length : ''}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 댓글 입력 */}
            <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--dm-border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, position: 'sticky', bottom: 0, background: 'var(--dm-bg)', zIndex: 10 }}>
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handlePostComment()}
                placeholder={postingComment ? '등록 중...' : '댓글을 입력하세요'}
                maxLength={200}
                disabled={postingComment}
                style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 14, boxSizing: 'border-box' }}
              />
              <button
                onClick={handlePostComment}
                disabled={postingComment || !hasCommentText}
                style={{
                  background: hasCommentText ? '#4B6FFF' : 'var(--dm-input)',
                  color: hasCommentText ? '#fff' : 'var(--dm-muted)',
                  border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: hasCommentText ? 'pointer' : 'default', flexShrink: 0,
                }}
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
