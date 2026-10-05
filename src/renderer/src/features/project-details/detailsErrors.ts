import {
  requiredProjectName,
  projectText,
  type ProjectDetails
} from '../../../../domain/projects/details'
export function detailsErrors(
  value: ProjectDetails,
  creating: boolean,
  originalTitle?: string
): Partial<Record<keyof ProjectDetails, string>> {
  return {
    title:
      value.title === originalTitle || requiredProjectName(value.title.trim())
        ? undefined
        : 'Enter a title of 1–500 characters without line breaks or control characters.',
    byline:
      (!creating && value.byline === '') || requiredProjectName(value.byline.trim())
        ? undefined
        : 'Enter an author or byline of 1–500 characters.',
    description: projectText(value.description, 10000)
      ? undefined
      : 'Use up to 10,000 characters, without invalid control characters.'
  }
}
