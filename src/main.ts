import './styles/app.css';
import { buildShell } from './ui/shell';
import './ui/explore';
import './ui/fight';
import './ui/savecard';
import { showTitle } from './ui/story';

buildShell();
// game007 为独立开发测试版本，仅使用本机存档，不启动云同步或账号处理。
showTitle(true);
