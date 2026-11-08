import { decorateBackground } from './common/dom';
import { horseSvg } from './common/horse';

decorateBackground();
document.querySelectorAll<HTMLElement>('[data-horse]').forEach((el) => {
  el.innerHTML = horseSvg(Number(el.dataset.horse), 'running');
});
