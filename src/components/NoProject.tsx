import { FolderKanban, Sparkles } from 'lucide-react'
import { navigate } from '../router'
import { Button, Card, Empty } from './ui'

/** Shown by project-scoped pages when the workspace has no project selected. */
export function NoProject() {
  return (
    <Card>
      <Empty
        icon={<FolderKanban size={20} />}
        title="No project selected"
        action={
          <div className="flex gap-2">
            <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => navigate('generator')}>
              Generate a project plan
            </Button>
            <Button onClick={() => navigate('projects')}>Open My Projects</Button>
          </div>
        }
      >
        Create a project with the AI Project Generator or pick one from My Projects to see it here.
      </Empty>
    </Card>
  )
}
