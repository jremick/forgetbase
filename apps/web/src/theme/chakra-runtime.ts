import { Alert } from "@chakra-ui/react/alert";
import { Badge } from "@chakra-ui/react/badge";
import { Button } from "@chakra-ui/react/button";
import { Card } from "@chakra-ui/react/card";
import { Input } from "@chakra-ui/react/input";
import { Progress } from "@chakra-ui/react/progress";
import { Separator } from "@chakra-ui/react/separator";
import { Skeleton } from "@chakra-ui/react/skeleton";
import { chakra } from "@chakra-ui/react/styled-system";
import { Table } from "@chakra-ui/react/table";
import { Text } from "@chakra-ui/react/text";
import { Textarea } from "@chakra-ui/react/textarea";

export const chakraRuntime = {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Progress,
  Separator,
  Skeleton,
  Table,
  Text,
  Textarea,
  chakra
} satisfies Record<string, unknown>;
