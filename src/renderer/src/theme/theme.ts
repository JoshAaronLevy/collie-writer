import {
  Button,
  Checkbox,
  createTheme,
  Input,
  InputWrapper,
  Menu,
  Modal,
  Paper
} from '@mantine/core'
import styles from '../components/ui/controls.module.css'

// Static counterparts live in tokens.css: runtime CSS-variable injection is deliberately disabled.
export const collieTheme = createTheme({
  primaryColor: 'green',
  primaryShade: { light: 7, dark: 3 },
  colors: {
    green: [
      '#f2f7f3',
      '#e7f0e9',
      '#c8e2d2',
      '#a7d7bd',
      '#7cb49a',
      '#559278',
      '#397b62',
      '#2f6757',
      '#285547',
      '#204438'
    ]
  },
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  fontSizes: { xs: '0.8125rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' },
  lineHeights: { xs: '1.4', sm: '1.5', md: '1.6', lg: '1.6', xl: '1.6' },
  spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
  radius: { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem' },
  defaultRadius: 'sm',
  focusRing: 'auto',
  respectReducedMotion: true,
  headings: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: '600'
  },
  components: {
    Button: Button.extend({
      defaultProps: { size: 'md', variant: 'filled' },
      classNames: {
        root: styles['action-button'],
        inner: styles['action-button-content'],
        label: styles['action-button-label']
      }
    }),
    Input: Input.extend({
      defaultProps: { size: 'md' },
      classNames: { input: styles['field-input'], section: styles['field-adornment'] }
    }),
    InputWrapper: InputWrapper.extend({
      classNames: {
        root: styles['field-container'],
        label: styles['field-label'],
        description: styles['field-description'],
        error: styles['field-error']
      }
    }),
    Checkbox: Checkbox.extend({
      defaultProps: { size: 'md' },
      classNames: {
        root: styles['choice-field'],
        input: styles['choice-input'],
        label: styles['choice-label'],
        description: styles['choice-description'],
        icon: styles['choice-icon']
      }
    }),
    Menu: Menu.extend({
      classNames: {
        dropdown: styles['action-menu'],
        item: styles['action-menu-item'],
        itemLabel: styles['action-menu-label']
      }
    }),
    Modal: Modal.extend({
      classNames: {
        content: styles['dialog-content'],
        header: styles['dialog-header'],
        title: styles['dialog-title'],
        body: styles['dialog-body'],
        close: styles['dialog-close'],
        overlay: styles['dialog-overlay'],
        inner: styles['dialog-position']
      }
    }),
    Paper: Paper.extend({ classNames: { root: styles['content-surface'] } })
  }
})
