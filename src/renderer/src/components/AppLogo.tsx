import collieWriterLogo from '../assets/collie-writer.png?no-inline'
import styles from './AppLogo.module.css'

export function AppLogo({ size = 'header' }: { size?: 'header' | 'about' }): React.JSX.Element {
  return (
    <img
      className={styles['app-logo']}
      data-size={size}
      src={collieWriterLogo}
      width={256}
      height={256}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
