const { ensurePageLogin, loginWithWechat, gotoLoginPage, gotoRegisterPage } = require('../../utils/auth')
const { backToCurrentTabRoot } = require('../../utils/navigation')
const {
  getSettlement,
  submitParticipantSettlement,
  submitAuthorSettlement,
  cancelAllSettlement,
} = require('../../utils/postApi')

function formatTime(ts) {
  const value = Number(ts || 0)
  if (!value) return ''
  const date = new Date(value)
  const pad = (num) => String(num).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function buildStatusText(item) {
  if (!item) return '待履约确认'
  if (item.finalStatus === 'completed') return '已完成'
  if (item.finalStatus === 'cancelled') return '已取消'
  if (item.finalStatus === 'no_show') return '未到场'
  if (item.finalStatus === 'disputed') return '活动异常待处理'
  if (item.participantDecision === 'completed') return '参与者已确认参加，等待发起人处理'
  if (item.participantDecision === 'cancelled') return '参与者已确认取消'
  if (item.participantDecision === 'disputed') return '参与者反馈活动异常'
  return '待履约确认'
}

function participantOptions() {
  return [
    { key: 'completed', label: '我已参加', tone: 'primary' },
    { key: 'cancelled', label: '我已取消', tone: 'warn' },
    { key: 'disputed', label: '活动异常', tone: 'neutral' },
  ]
}

function authorOptions() {
  return [
    { key: 'completed', label: '已到场', tone: 'primary' },
    { key: 'no_show', label: '未到场', tone: 'warn' },
  ]
}

function splitFlowLabel(label) {
  const text = String(label || '').trim().replace(/\s+/g, '')
  if (!text) return []
  if (text.length <= 2) return [text]
  if (text.length === 3) return [text.slice(0, 1), text.slice(1)]
  const middle = Math.ceil(text.length / 2)
  return [text.slice(0, middle), text.slice(middle)].filter(Boolean)
}

Page({
  data: {
    isLoggedIn: false,
    showLoginModal: false,
    postId: '',
    postTitle: '',
    viewerIsAuthor: false,
    projectCancelled: false,
    canCancelAll: false,
    stage: 'done',
    flowLabel: '',
    flowLabelLines: [],
    pendingMemberCount: 0,
    reviewDeadlineText: '',
    items: [],
    currentItem: null,
    selectedUserId: '',
    reviewTargets: [],
    noteText: '',
    loading: false,
    submitting: false,
    showDecisionSheet: false,
    decisionTitle: '',
    decisionOptions: [],
    showCancelAllModal: false,
  },

  onLoad(options) {
    const postId = (options && options.id) || ''
    const title = decodeURIComponent((options && options.title) || '履约处理')
    this.setData({ postId, postTitle: title })
    if (ensurePageLogin(this) && postId) {
      this.loadData()
    }
  },

  onShow() {
    if (ensurePageLogin(this) && this.data.postId) {
      this.loadData()
    }
  },

  backToProfile() {
    wx.switchTab({ url: '/pages/profile/index' })
  },

  goReviewPage() {
    wx.redirectTo({
      url: '/pages/review/index?id=' + encodeURIComponent(this.data.postId) + '&title=' + encodeURIComponent(this.data.postTitle || '活动评分'),
      fail: () => {
        backToCurrentTabRoot()
      },
    })
  },

  normalizeItems(items) {
    return (items || []).map((item) => Object.assign({}, item, {
      statusText: buildStatusText(item),
      participantConfirmedText: formatTime(item.participantConfirmedAt),
      authorConfirmedText: formatTime(item.authorConfirmedAt),
      settledText: formatTime(item.settledAt),
    }))
  },

  pickCurrentItem(items, viewerIsAuthor) {
    if (!Array.isArray(items) || !items.length) return null
    if (!viewerIsAuthor) return items[0]
    const selectedUserId = this.data.selectedUserId
    return items.find((item) => item.user.id === selectedUserId) || items[0]
  },

  maybeOpenParticipantDecision(stage, viewerIsAuthor, currentItem) {
    if (viewerIsAuthor || stage !== 'settlement' || !currentItem || this.data.submitting) return
    const signature = stage + ':' + (currentItem.user && currentItem.user.id ? currentItem.user.id : '')
    if (this._decisionPromptKey === signature) return
    this._decisionPromptKey = signature
    this.setData({
      showDecisionSheet: true,
      decisionTitle: '确认你的活动情况',
      decisionOptions: participantOptions(),
    })
  },

  loadData() {
    this.setData({ loading: true })
    return getSettlement(this.data.postId)
      .then((res) => {
        const items = this.normalizeItems(res.items || [])
        const currentItem = this.pickCurrentItem(items, !!res.viewerIsAuthor)
        const selectedUserId = currentItem && currentItem.user ? currentItem.user.id : ''

        this.setData({
          postTitle: res.postTitle || this.data.postTitle,
          viewerIsAuthor: !!res.viewerIsAuthor,
          projectCancelled: !!res.projectCancelled,
          canCancelAll: !!res.canCancelAll,
          stage: res.stage || 'done',
          flowLabel: res.flowLabel || '',
          flowLabelLines: splitFlowLabel(res.flowLabel || ''),
          pendingMemberCount: Number(res.pendingMemberCount || 0),
          reviewDeadlineText: formatTime(res.reviewDeadlineAt),
          items,
          currentItem,
          selectedUserId,
          reviewTargets: res.reviewTargets || [],
          loading: false,
          noteText: '',
        })

        this.maybeOpenParticipantDecision(res.stage || 'done', !!res.viewerIsAuthor, currentItem)
        return res
      })
      .catch((err) => {
        this.setData({ loading: false })
        wx.showToast({ title: (err && err.message) || '加载履约信息失败', icon: 'none' })
        throw err
      })
  },

  onLoginTap() {
    this.setData({ showLoginModal: true })
  },

  onLoginModalClose() {
    this.setData({ showLoginModal: false })
  },

  onWechatLogin() {
    loginWithWechat()
      .then(() => {
        this.setData({ showLoginModal: false })
        if (ensurePageLogin(this)) this.loadData()
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '登录失败', icon: 'none' })
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

  onAuthorCardTap(e) {
    if (!this.data.viewerIsAuthor) return
    const userId = e.currentTarget.dataset.userId
    const currentItem = (this.data.items || []).find((item) => item.user.id === userId) || null
    this.setData({ selectedUserId: userId, currentItem })
  },

  onNoteInput(e) {
    this.setData({ noteText: (e.detail && e.detail.value) || '' })
  },

  onPrimaryActionTap() {
    if (this.data.submitting) return
    if (this.data.stage === 'review') {
      this.goReviewPage()
      return
    }
    if (this.data.stage !== 'settlement') {
      this.backToProfile()
      return
    }

    if (this.data.viewerIsAuthor) {
      if (!this.data.currentItem) {
        wx.showToast({ title: '当前没有待处理成员', icon: 'none' })
        return
      }
      this.setData({
        showDecisionSheet: true,
        decisionTitle: '确认该成员的履约情况',
        decisionOptions: authorOptions(),
      })
      return
    }

    this.setData({
      showDecisionSheet: true,
      decisionTitle: '确认你的活动情况',
      decisionOptions: participantOptions(),
    })
  },

  onDecisionSheetClose() {
    if (this.data.submitting) return
    this.setData({ showDecisionSheet: false })
  },

  handleSettlementResult(decision, res) {
    if (res.projectCancelled || res.stage === 'cancelled') {
      this.backToProfile()
      return
    }

    if (!this.data.viewerIsAuthor) {
      if (decision === 'completed' && res.reviewTargets && res.reviewTargets.length) {
        this.goReviewPage()
        return
      }
      this.backToProfile()
      return
    }

    if (res.stage === 'review' && res.reviewTargets && res.reviewTargets.length) {
      this.goReviewPage()
      return
    }

    if (res.stage !== 'settlement' || !res.items || !res.items.length) {
      this.backToProfile()
    }
  },

  onDecisionOptionTap(e) {
    const decision = e.currentTarget.dataset.decision
    if (!decision || this.data.submitting) return
    const note = (this.data.noteText || '').trim()

    this.setData({ submitting: true })
    const request = this.data.viewerIsAuthor
      ? submitAuthorSettlement(this.data.postId, {
          userId: this.data.selectedUserId,
          decision,
          note,
        })
      : submitParticipantSettlement(this.data.postId, {
          decision,
          note,
        })

    request
      .then(() => {
        if (this.data.viewerIsAuthor && this.data.selectedUserId) {
          const nextItems = (this.data.items || []).filter((item) => item.user.id !== this.data.selectedUserId)
          const nextItem = nextItems[0] || null
          this.setData({
            items: nextItems,
            currentItem: nextItem,
            selectedUserId: nextItem && nextItem.user ? nextItem.user.id : '',
          })
        }
        this.setData({
          submitting: false,
          showDecisionSheet: false,
          noteText: '',
        })
        wx.showToast({ title: '处理成功', icon: 'success' })
        return this.loadData().then((res) => this.handleSettlementResult(decision, res))
      })
      .catch((err) => {
        this.setData({ submitting: false })
        wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' })
      })
  },

  onCancelAllTap() {
    if (this.data.submitting) return
    this.setData({ showCancelAllModal: true })
  },

  onCancelAllClose() {
    if (this.data.submitting) return
    this.setData({ showCancelAllModal: false })
  },

  onCancelAllConfirm() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    cancelAllSettlement(this.data.postId)
      .then(() => {
        wx.showToast({ title: '项目已取消', icon: 'success' })
        this.setData({ submitting: false, showCancelAllModal: false })
        this.backToProfile()
      })
      .catch((err) => {
        this.setData({ submitting: false })
        wx.showToast({ title: (err && err.message) || '取消项目失败', icon: 'none' })
      })
  },

  onBackProfileTap() {
    this.backToProfile()
  },
})
