const { ensurePageLogin, loginWithWechat, gotoLoginPage, gotoRegisterPage } = require('../../utils/auth')
const { openPage } = require('../../utils/navigation')
const { getUserHome } = require('../../utils/postApi')
const { statusFromHomePost } = require('../../utils/postPresentation')

function formatChatTime(timestamp) {
  const ts = Number(timestamp || 0)
  if (!ts) return '--'
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const pad = (n) => String(n).padStart(2, '0')
  if (sameDay) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes())
  }
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

Page({
  data: {
    isLoggedIn: false,
    showLoginModal: false,
    activeTab: 0,
    initiatedList: [],
    joinedList: [],
  },

  onLoad() {
    const logged = ensurePageLogin(this)
    if (logged) this.refreshList()
  },

  onShow() {
    const logged = ensurePageLogin(this)
    if (logged) this.refreshList()
  },

  onLoginTap() {
    this.setData({ showLoginModal: true })
  },

  onLoginModalClose() {
    this.setData({ showLoginModal: false })
  },

  onWechatLogin() {
    loginWithWechat().then(() => {
      this.setData({ showLoginModal: false })
      const logged = ensurePageLogin(this)
      if (logged) this.refreshList()
      wx.showToast({ title: '登录成功', icon: 'success' })
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '登录失败，请重试', icon: 'none' })
    })
  },

  onPasswordLogin() {
    this.setData({ showLoginModal: false })
    gotoLoginPage()
  },

  onRegister() {
    this.setData({ showLoginModal: false })
    gotoRegisterPage()
  },

  refreshList() {
    const app = getApp()
    const currentUser = app.globalData.currentUser
    if (!currentUser || !currentUser.id) {
      this.setData({ initiatedList: [], joinedList: [] })
      return
    }

    getUserHome(currentUser.id).then(({ initiatedPosts, joinedPosts }) => {
      this.setData({
        initiatedList: this.buildChatItems(initiatedPosts, 'author'),
        joinedList: this.buildChatItems(joinedPosts, 'participant'),
      })
    }).catch((err) => {
      this.setData({ initiatedList: [], joinedList: [] })
      wx.showToast({ title: (err && err.message) || '加载聊天列表失败', icon: 'none' })
    })
  },

  buildChatItems(posts, role) {
    const items = (posts || []).map((post) => {
      const preview = post.chatPreview || {}
      const sender = preview.latestMessageSender || null
      const lastTimestamp = preview.latestMessageAt || post.updatedAt || post.createdAt || 0
      const status = statusFromHomePost(post, role)
      return {
        id: post.id,
        title: post.title || '未命名活动',
        avatarUrl: (sender && sender.avatarUrl) || (post.author && post.author.avatarUrl) || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
        lastMessage: preview.latestMessage || '进入群聊后就能开始交流',
        senderName: sender ? sender.nickName : '',
        lastTime: formatChatTime(lastTimestamp),
        lastTimestamp,
        statusText: status.text,
        statusTone: status.tone,
      }
    })

    items.sort((a, b) => b.lastTimestamp - a.lastTimestamp)
    return items
  },

  onTabTap(e) {
    const idx = Number(e.currentTarget.dataset.index || 0)
    this.setData({ activeTab: idx })
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    const title = e.currentTarget.dataset.title
    openPage('/pages/chat-room/index?id=' + id + '&title=' + encodeURIComponent(title))
  },
})
