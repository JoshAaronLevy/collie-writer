import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { Button, Checkbox, NativeSelect, Textarea, type ButtonProps, type CheckboxProps, type NativeSelectProps, type TextareaProps } from '@mantine/core'

type AppButtonProps = ButtonProps & Omit<ComponentPropsWithoutRef<'button'>, keyof ButtonProps> & {
  pending?: boolean
}

// Pending work retains its readable label instead of replacing it with an unlabeled spinner.
export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(function AppButton(
  { pending = false, disabled, type = 'button', ...props }, ref
) {
  return <Button {...props} data-collie-button ref={ref} type={type} disabled={disabled || pending} aria-busy={pending || undefined} />
})

export function SelectField(props: Omit<NativeSelectProps, 'label'> & { label: string }): React.JSX.Element {
  return <NativeSelect {...props} errorProps={{ role: 'alert', ...props.errorProps }} />
}

export function TextareaField(props: Omit<TextareaProps, 'label'> & { label: string }): React.JSX.Element {
  return <Textarea {...props} errorProps={{ role: 'alert', ...props.errorProps }} />
}

export function ChoiceField(props: Omit<CheckboxProps, 'label'> & { label: string }): React.JSX.Element {
  return <Checkbox {...props} />
}
