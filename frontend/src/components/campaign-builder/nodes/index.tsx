import { memo } from 'react';
import { Type, Image, Video, Music, Clock, ListChecks, Layers, Split, Filter } from 'lucide-react';
import BaseNode from '../BaseNode';

const NodeComponent = memo(({ data, type, selected }: any) => {
  const configs: Record<string, { icon: any, title: string }> = {
    text: { icon: <Type size={16} />, title: 'Texto' },
    image: { icon: <Image size={16} />, title: 'Imagem' },
    video: { icon: <Video size={16} />, title: 'Vídeo' },
    audio: { icon: <Music size={16} />, title: 'Áudio' },
    delay: { icon: <Clock size={16} />, title: 'Delay' },
    poll: { icon: <ListChecks size={16} />, title: 'Enquete' },
    list: { icon: <Layers size={16} />, title: 'Lista' },
    abTest: { icon: <Split size={16} />, title: 'Teste A/B' },
    condition: { icon: <Filter size={16} />, title: 'Condição' },
  };

  const config = configs[type] || configs.text;

  return (
    <BaseNode 
      data={data} 
      type={type} 
      icon={config.icon} 
      title={config.title} 
      selected={selected} 
    />
  );
});

export const nodeTypes = {
  text: NodeComponent,
  image: NodeComponent,
  video: NodeComponent,
  audio: NodeComponent,
  delay: NodeComponent,
  poll: NodeComponent,
  list: NodeComponent,
  abTest: NodeComponent,
  condition: NodeComponent,
};
