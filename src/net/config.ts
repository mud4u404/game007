/**
 * 云存档后台（Supabase 免费版）的地址和公开密钥。设置步骤见 docs/cloud-setup.md。
 * 这两样本来就是公开给网页用的，靠数据库的行级权限保证每人只能读写自己的存档。
 * game007 用于独立开发和测试，不配置云后台；账号功能隐藏，游戏以本地存档运行。
 */
export const SUPABASE_URL = '';
export const SUPABASE_KEY = '';
/** 用户名换算成的内部邮箱用这个域名；邮箱验证已关，不会真的发信 */
export const EMAIL_DOMAIN = 'players.game007.invalid';
