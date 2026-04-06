const { getCurrentLocation } = require('../../utils/location')
const { validatePostForm, buildTimeInfo } = require('../../utils/postForm')
const { ensurePageLogin, loginWithWechat, gotoLoginPage, gotoRegisterPage } = require('../../utils/auth')
const { openPage } = require('../../utils/navigation')
const { createPost } = require('../../utils/postApi')

const TAG_OPTIONS = {
  运动: ['羽毛球', '足球', '篮球', '跑步', '骑行', '游泳', '其他运动'],
  娱乐: ['桌游', '电影', 'KTV', '游戏', '其他娱乐'],
  学习: ['英语', '考研', '编程', '读书', '其他学习'],
}

Page({
  data: {
    isLoggedIn: false,
    showLoginModal: false,
    title: '',
    description: '',
    category: '',
    subCategory: '',
    timeMode: 'range',
    timeRange: 7,
    fixedTime: '',
    fixedTimeDisplay: '',
    locationMode: 'current',
    locationText: '',
    locationCoords: null,
    maxCount: 2,
    errors: {},
    showCategoryModal: false,
    categoryArray: ['运动', '娱乐', '学习', '其他'],
    showTagModal: false,
    tagOptions: [],
    showTagManualInput: false,
    showDateModal: false,
    selectedDate: '',
    selectedClock: '09:00',
    submitting: false,
  },

  onShow() {
    ensurePageLogin(this)
  },

  onLoginTap() {
    this.setData({ showLoginModal: true })
  },

  onLoginModalClose() {
    this.setData({ showLoginModal: false })
  },

  onWechatLogin() {
    loginWithWechat().then(() => {
      ensurePageLogin(this)
      this.setData({ showLoginModal: false })
      wx.showToast({ title: '登录成功', icon: 'success' })
    }).catch((err) => {
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

  onTitleInput(e) { this.setData({ title: e.detail.value }) },
  onDescriptionInput(e) { this.setData({ description: e.detail.value }) },

  onCategoryClick() { this.setData({ showCategoryModal: true }) },
  onCategoryModalClose() { this.setData({ showCategoryModal: false }) },

  onCategorySelect(e) {
    const idx = e.currentTarget.dataset.index
    const category = this.data.categoryArray[idx]
    this.setData({
      category,
      subCategory: '',
      tagOptions: TAG_OPTIONS[category] || [],
      showTagManualInput: category === '其他',
      showCategoryModal: false,
      'errors.category': '',
      'errors.subCategory': '',
    })
  },

  onTagClick() {
    if (!this.data.category || this.data.showTagManualInput) return
    this.setData({ showTagModal: true })
  },
  onTagModalClose() { this.setData({ showTagModal: false }) },
  onTagSelect(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({
      subCategory: this.data.tagOptions[idx] || '',
      showTagModal: false,
      'errors.subCategory': '',
    })
  },
  onTagManualInput(e) {
    this.setData({ subCategory: e.detail.value || '', 'errors.subCategory': '' })
  },

  onTimeModeChange(e) { this.setData({ timeMode: e.detail.value }) },
  onTimeRangeInput(e) { this.setData({ timeRange: parseInt(e.detail.value, 10) || 1 }) },
  onFixedTimeClick() { this.setData({ showDateModal: true }) },
  onDateModalClose() { this.setData({ showDateModal: false }) },
  onDateChange(e) { this.setData({ selectedDate: e.detail.value }) },
  onClockChange(e) { this.setData({ selectedClock: e.detail.value }) },

  onDateConfirm() {
    if (!this.data.selectedDate || !this.data.selectedClock) {
      wx.showToast({ title: '请选择日期和时间', icon: 'none' })
      return
    }
    const localText = this.data.selectedDate + ' ' + this.data.selectedClock
    const fixedDate = new Date(localText.replace(/-/g, '/') + ':00')
    const fixedTs = fixedDate.getTime()
    const nowTs = Date.now()
    if (!Number.isFinite(fixedTs)) {
      wx.showToast({ title: '时间格式不正确', icon: 'none' })
      return
    }
    if (fixedTs <= nowTs) {
      wx.showToast({ title: '固定时间必须晚于当前时间', icon: 'none' })
      return
    }

    this.setData({
      fixedTime: fixedDate.toISOString(),
      fixedTimeDisplay: localText,
      showDateModal: false,
      'errors.fixedTime': '',
    })
  },

  onLocationModeChange(e) {
    const mode = e.detail.value
    this.setData({ locationMode: mode })
    if (mode === 'current') this._fetchCurrentLocation()
  },

  onGetCurrentLocation() { this._fetchCurrentLocation() },

  _fetchCurrentLocation() {
    getCurrentLocation().then((res) => {
      this.setData({
        locationText: res.address || '当前位置',
        locationCoords: { latitude: res.latitude, longitude: res.longitude },
        'errors.locationText': '',
      })
    }).catch(() => {
      wx.showToast({ title: '获取定位失败，请手动输入', icon: 'none' })
      this.setData({ locationMode: 'manual' })
    })
  },

  onLocationInput(e) { this.setData({ locationText: e.detail.value }) },
  onMaxCountInput(e) { this.setData({ maxCount: parseInt(e.detail.value, 10) || 2 }) },

  validateForm() {
    return validatePostForm(this.data, { requireSubCategory: true, minMaxCount: 2 })
  },

  onSubmit() {
    if (!this.data.isLoggedIn) {
      this.onLoginTap()
      return
    }
    if (this.data.submitting) return

    const result = this.validateForm()
    if (!result.valid) {
      this.setData({ errors: result.errors })
      wx.showToast({ title: '请检查输入', icon: 'none' })
      return
    }

    const timeInfo = buildTimeInfo(this.data.timeMode, this.data.timeRange, this.data.fixedTime)
    const payload = {
      title: (this.data.title || '').trim(),
      description: (this.data.description || '').trim(),
      category: this.data.category,
      subCategory: this.data.subCategory || '',
      timeInfo,
      address: (this.data.locationText || '').trim(),
      coords: this.data.locationCoords
        ? { latitude: this.data.locationCoords.latitude, longitude: this.data.locationCoords.longitude }
        : null,
      maxCount: this.data.maxCount,
    }

    this.setData({ submitting: true })
    createPost(payload).then((post) => {
      const app = getApp()
      const oldPosts = Array.isArray(app.globalData.posts) ? app.globalData.posts : []
      app.globalData.posts = [post].concat(oldPosts.filter((item) => item.id !== post.id))
      wx.showToast({ title: '发布成功', icon: 'success' })
      setTimeout(() => {
        openPage('/pages/detail/index?id=' + post.id)
      }, 250)
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '发布失败', icon: 'none' })
    }).finally(() => {
      this.setData({ submitting: false })
    })
  },
})

